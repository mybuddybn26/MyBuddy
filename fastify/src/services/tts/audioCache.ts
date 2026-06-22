interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCached(hash: string): CacheEntry | undefined {
  const entry = cache.get(hash);
  if (entry) {
    return entry;
  }
  return undefined;
}

export function setCache(hash: string, buffer: Buffer, contentType: string): void {
  // Limit cache to 50 entries, evict oldest
  if (cache.size >= 50) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(hash, { buffer, contentType, createdAt: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}
