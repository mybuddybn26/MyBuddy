import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import {
  Camera,
  Eye,
  Upload,
  Loader2,
  FileDown,
  Trash2,
  TriangleAlert,
  FileText,
  FileSearch,
} from 'lucide-react';

interface Doc {
  id: string;
  imageUrl: string;
  aiSummary: string;
  docType: string;
  image_url?: string;
  ai_summary?: string;
  doc_type?: string;
  createdAt?: string;
  created_at?: string;
}

function imgUrl(doc: Doc): string {
  return doc.imageUrl || doc.image_url || '';
}
function docSummary(doc: Doc): string {
  return doc.aiSummary || doc.ai_summary || '';
}
function docType(doc: Doc): string {
  return doc.docType || doc.doc_type || 'other';
}
function docDate(doc: Doc): string {
  const d = doc.createdAt || doc.created_at;
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString();
}
function isPdf(doc: Doc): boolean {
  return (doc.imageUrl || doc.image_url || '').toLowerCase().endsWith('.pdf');
}

export function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .documents()
      .then((res) => {
        setDocs(res.data as unknown as Doc[]);
      })
      .catch(() => {});
  }, []);

  const analyzeDocument = async (docId: string) => {
    setAnalyzingId(docId);
    setAnalysisError(null);
    try {
      const result = await api.analyzeDocument(docId);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                aiSummary: result.summary,
                docType: result.doc_type,
                ai_summary: result.summary,
                doc_type: result.doc_type,
              }
            : d,
        ),
      );
      setSelectedDoc((prev) =>
        prev?.id === docId
          ? {
              ...prev,
              aiSummary: result.summary,
              docType: result.doc_type,
              ai_summary: result.summary,
              doc_type: result.doc_type,
            }
          : prev,
      );
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Analysis failed. Please try again.',
      );
    }
    setAnalyzingId(null);
  };

  const generatePdf = async () => {
    const doc = selectedDoc;
    if (!doc || !docSummary(doc)) return;
    setGeneratingPdf(true);
    try {
      const summaryText = docSummary(doc);
      const blob = await api.generatePdf('Document Analysis', [
        {
          heading: 'AI Summary',
          body: summaryText,
        },
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mybuddy-doc-${doc.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF generation failed. You may need more credits.');
    }
    setGeneratingPdf(false);
  };

  const confirmDeleteDoc = (id: string) => {
    setDeleteConfirmId(id);
  };

  const cancelDeleteDoc = () => {
    setDeleteConfirmId(null);
  };

  const executeDeleteDoc = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await api.deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch {
      alert('Failed to delete document');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    if (!validTypes.includes(file.type)) {
      setError(
        `Unsupported file type: ${file.type || 'unknown'}. Please upload an image or PDF.`,
      );
      setUploading(false);
      e.target.value = '';
      return;
    }

    try {
      const uploadRes = await api.uploadImage(file);
      const isPdf = file.type === 'application/pdf';
      const docRes = (await api.createDocument({
        image_url: uploadRes.url,
        doc_type: isPdf ? 'other' : 'other',
        ai_summary: '',
      })) as unknown as Doc;

      setDocs((prev) => [docRes, ...prev]);

      analyzeDocument(docRes.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Upload failed. Please check file size and type.',
      );
    }

    setUploading(false);
    e.target.value = '';
  };

  const handleImageError = (docId: string) => {
    setBrokenImages((prev) => new Set(prev).add(docId));
  };

  const docTypeLabel: Record<string, string> = {
    bill: 'Receipt',
    letter: 'Letter',
    permit: 'Permit',
    statement: 'Statement',
    other: 'Document',
  };

  const docTypeColor: Record<string, string> = {
    bill: 'bg-amber-50 text-amber-700 border-amber-200',
    letter: 'bg-primary-50 text-primary-700 border-primary-200',
    permit: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    statement: 'bg-violet-50 text-violet-700 border-violet-200',
    other: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  return (
    <div className='min-h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        {/* Header */}
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='text-xl font-bold text-slate-800'>
              Snap & Simplify
            </h1>
            <p className='text-sm text-slate-500 mt-0.5'>
              Photograph & understand any document
            </p>
          </div>
          <div className='flex gap-2'>
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
              className='flex items-center gap-2 px-3 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50'
            >
              <Camera size={16} />
              Photo
            </button>
            <button
              onClick={() => pdfRef.current?.click()}
              disabled={uploading}
              className='flex items-center gap-2 px-3 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50'
            >
              <Upload size={16} />
              File
            </button>
          </div>
          <input
            ref={cameraRef}
            type='file'
            accept='image/*'
            capture='environment'
            className='hidden'
            onChange={handleUpload}
          />
          <input
            ref={pdfRef}
            type='file'
            accept='image/*,application/pdf'
            className='hidden'
            onChange={handleUpload}
          />
        </div>

        {error && (
          <div className='glass-card p-3 flex items-start gap-2 text-sm text-red-600 bg-red-50/50 border-red-200'>
            <TriangleAlert size={16} className='flex-shrink-0 mt-0.5' />
            <span>{error}</span>
          </div>
        )}

        {/* Selected Document Detail */}
        {selectedDoc && (
          <div className='glass-card p-4 animate-slide-up'>
            <div className='flex items-start justify-between mb-3'>
              <div
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${docTypeColor[docType(selectedDoc)] || docTypeColor.other}`}
              >
                {isPdf(selectedDoc)
                  ? 'PDF'
                  : docTypeLabel[docType(selectedDoc)] || docTypeLabel.other}
              </div>
              <div className='flex items-center gap-2'>
                {analyzingId === selectedDoc.id && (
                  <span className='flex items-center gap-1 text-xs text-primary-500'>
                    <Loader2 size={12} className='animate-spin' />
                    Analyzing…
                  </span>
                )}
                <button
                  onClick={() => analyzeDocument(selectedDoc.id)}
                  disabled={analyzingId === selectedDoc.id}
                  className='text-xs text-primary-500 hover:text-primary-700 disabled:opacity-50'
                >
                  Re-analyze
                </button>
                <button
                  onClick={() => confirmDeleteDoc(selectedDoc.id)}
                  className='text-xs text-red-400 hover:text-red-600'
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className='text-slate-400 hover:text-slate-600 text-sm'
                >
                  Close
                </button>
              </div>
            </div>
            {brokenImages.has(selectedDoc.id) || !imgUrl(selectedDoc) ? (
              <div className='w-full rounded-xl mb-3 border border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-12 text-slate-300'>
                <FileText size={48} />
                <span className='text-sm mt-2 text-slate-400'>
                  {docTypeLabel[docType(selectedDoc)] || 'Document'}
                </span>
              </div>
            ) : (
              <img
                src={imgUrl(selectedDoc)}
                alt=''
                className='w-full rounded-xl mb-3 border border-slate-200'
                onError={() => handleImageError(selectedDoc.id)}
              />
            )}
            <div className='bg-primary-50 border border-primary-100 rounded-xl p-3'>
              <h4 className='text-sm font-semibold text-primary-800 mb-1'>
                AI Summary
              </h4>
              {analyzingId === selectedDoc.id ? (
                <div className='flex items-center gap-2 text-sm text-slate-500 py-2'>
                  <Loader2 size={14} className='animate-spin' />
                  Analyzing document…
                </div>
              ) : docSummary(selectedDoc) ? (
                <>
                  <p className='text-sm text-slate-700 whitespace-pre-wrap leading-relaxed'>
                    {docSummary(selectedDoc)}
                  </p>
                  <button
                    onClick={generatePdf}
                    disabled={generatingPdf}
                    className='mt-3 flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50'
                  >
                    <FileDown size={14} />
                    {generatingPdf ? 'Generating…' : 'Download PDF'}
                  </button>
                </>
              ) : analysisError ? (
                <div>
                  <p className='text-sm text-red-600 mb-2 flex items-center gap-1'>
                    <TriangleAlert size={14} /> {analysisError}
                  </p>
                  <button
                    onClick={() => analyzeDocument(selectedDoc.id)}
                    className='text-xs text-primary-500 hover:text-primary-700 font-medium'
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className='text-sm text-slate-400 italic'>
                  No analysis yet. Click "Re-analyze" to process.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Document Grid */}
        {docs.length === 0 ? (
          <div className='glass-card p-10 text-center'>
            <div className='w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4'>
              <FileSearch size={28} className='text-primary-400' />
            </div>
            <p className='text-slate-600 font-medium'>No documents yet</p>
            <p className='text-slate-400 text-sm mt-1 max-w-xs mx-auto leading-relaxed'>
              Scan a receipt, bill, or document and Buddy will summarize it.
            </p>
            <button
              onClick={() => cameraRef.current?.click()}
              className='mt-4 flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-600 transition-colors'
            >
              <Camera size={16} />
              Scan Document
            </button>
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            {docs.map((doc) => {
              const isBroken = brokenImages.has(doc.id);
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className='glass-card overflow-hidden text-left hover:shadow-lg transition-shadow group'
                >
                  <div className='aspect-[4/3] bg-slate-50 relative overflow-hidden'>
                    {isBroken || !imgUrl(doc) ? (
                      <div className='w-full h-full flex flex-col items-center justify-center text-slate-300'>
                        <FileText size={36} />
                        <span className='text-xs mt-2 text-slate-400'>
                          {docTypeLabel[docType(doc)] || 'Document'}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={imgUrl(doc)}
                        alt=''
                        className='w-full h-full object-cover'
                        onError={() => handleImageError(doc.id)}
                      />
                    )}
                    <div className='absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-3'>
                      <Eye
                        size={24}
                        className='text-white opacity-0 group-hover:opacity-100 transition-opacity'
                      />
                      <Trash2
                        size={20}
                        className='text-white opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300'
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDeleteDoc(doc.id);
                        }}
                      />
                    </div>
                    {analyzingId === doc.id && (
                      <div className='absolute inset-0 bg-black/40 flex items-center justify-center'>
                        <Loader2
                          size={24}
                          className='text-white animate-spin'
                        />
                      </div>
                    )}
                  </div>
                  <div className='p-3 space-y-1.5'>
                    <div
                      className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-medium border ${docTypeColor[docType(doc)] || docTypeColor.other}`}
                    >
                      {isPdf(doc)
                        ? 'PDF'
                        : docTypeLabel[docType(doc)] || docTypeLabel.other}
                    </div>
                    {docSummary(doc) ? (
                      <p className='text-xs text-slate-500 line-clamp-2'>
                        {docSummary(doc)}
                      </p>
                    ) : (
                      <p className='text-xs text-slate-400 italic'>
                        {analyzingId === doc.id
                          ? 'Analyzing…'
                          : 'Tap to analyze'}
                      </p>
                    )}
                    <p className='text-xs text-slate-400'>{docDate(doc)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Delete Confirmation Dialog ─── */}
        {deleteConfirmId && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in'>
            <div className='bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full space-y-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2.5 rounded-full bg-red-50'>
                  <TriangleAlert size={20} className='text-danger' />
                </div>
                <h3 className='font-semibold text-slate-800 text-base'>
                  Delete document?
                </h3>
              </div>
              <p className='text-sm text-slate-500 leading-relaxed'>
                Are you sure you want to delete this document? This cannot be
                undone.
              </p>
              <div className='flex gap-2'>
                <button
                  onClick={cancelDeleteDoc}
                  className='flex-1 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm'
                >
                  Cancel
                </button>
                <button
                  onClick={executeDeleteDoc}
                  className='flex-1 py-2.5 bg-danger text-white font-medium rounded-xl hover:bg-red-600 transition-colors text-sm'
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
