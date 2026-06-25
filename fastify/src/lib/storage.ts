// Document storage provider — Cloudinary (production) with local disk fallback

import { config } from '../config.js';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface UploadResult {
  url: string;
  filename: string;
  provider: 'cloudinary' | 'local';
}

let cloudinaryV2: typeof import('cloudinary').v2 | null = null;

function isCloudinaryConfigured(): boolean {
  return !!(
    config.CLOUDINARY_CLOUD_NAME &&
    config.CLOUDINARY_API_KEY &&
    config.CLOUDINARY_API_SECRET
  );
}

async function getCloudinary() {
  if (!cloudinaryV2) {
    const cloudinary = await import('cloudinary');
    cloudinaryV2 = cloudinary.v2;
    cloudinaryV2.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  return cloudinaryV2;
}

export async function uploadFile(
  buffer: Uint8Array,
  originalFilename: string,
  mimetype: string,
): Promise<UploadResult> {
  if (isCloudinaryConfigured()) {
    const cloudinary = await getCloudinary();
    const ext = originalFilename.split('.').pop() || 'jpg';
    const isPdf = mimetype === 'application/pdf';

    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: isPdf ? 'raw' : 'image',
            public_id: `mybuddy/${Date.now()}`,
            format: isPdf ? 'pdf' : ext,
            overwrite: true,
          },
          (error, result) => {
            if (error || !result) reject(error || new Error('Upload failed'));
            else resolve(result);
          },
        );
        stream.end(Buffer.from(buffer));
      },
    );

    return {
      url: result.secure_url,
      filename: result.public_id,
      provider: 'cloudinary',
    };
  }

  // ─── Local disk fallback ───
  await mkdir(config.UPLOAD_DIR, { recursive: true });
  const ext = originalFilename.split('.').pop() || 'jpg';
  const filename = `local_${Date.now()}.${ext}`;
  const filepath = join(config.UPLOAD_DIR, filename);

  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(filepath);
    ws.on('finish', resolve);
    ws.on('error', reject);
    ws.end(Buffer.from(buffer));
  });

  return {
    url: `/uploads/${filename}`,
    filename,
    provider: 'local',
  };
}

export function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export async function downloadFile(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
