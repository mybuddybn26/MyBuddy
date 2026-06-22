import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Camera, Eye, Upload, Loader2, FileDown, Trash2, TriangleAlert, FileText } from 'lucide-react';

interface Doc {
  id: string;
  image_url: string;
  ai_summary: string;
  doc_type: string;
  createdAt?: string;
  created_at?: string;
}

export function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
            ? { ...d, ai_summary: result.summary, doc_type: result.doc_type }
            : d,
        ),
      );
      setSelectedDoc((prev) =>
        prev?.id === docId
          ? { ...prev, ai_summary: result.summary, doc_type: result.doc_type }
          : prev,
      );
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    }
    setAnalyzingId(null);
  };

  const generatePdf = async () => {
    if (!selectedDoc?.ai_summary) return;
    setGeneratingPdf(true);
    try {
      const blob = await api.generatePdf('Document Analysis', [
        {
          heading: 'AI Summary',
          body: selectedDoc.ai_summary,
        },
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mybuddy-doc-${selectedDoc.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF generation failed. You may need more tokens.');
    }
    setGeneratingPdf(false);
  };

  const deleteDoc = async (id: string) => {
    try {
      await api.deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setSelectedDoc(null);
    } catch {
      alert('Failed to delete document');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Please upload an image or PDF.`);
      setUploading(false);
      e.target.value = '';
      return;
    }

    try {
      const uploadRes = await api.uploadImage(file);
      const docRes = (await api.createDocument({
        image_url: uploadRes.url,
        doc_type: 'other',
        ai_summary: file.type === 'application/pdf' ? 'PDF documents cannot be auto-analyzed by image recognition.' : '',
      })) as unknown as Doc;

      setDocs((prev) => [docRes, ...prev]);

      if (file.type !== 'application/pdf') {
        analyzeDocument(docRes.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please check file size and type.');
    }

    setUploading(false);
    e.target.value = '';
  };

  const typeBadge: Record<string, { color: string; label: string }> = {
    bill: { color: 'bg-amber-100 text-amber-700', label: '💳 Bill' },
    letter: { color: 'bg-primary-50 text-primary-700', label: '✉️ Letter' },
    permit: { color: 'bg-green-100 text-green-700', label: '📋 Permit' },
    statement: {
      color: 'bg-purple-100 text-purple-700',
      label: '📊 Statement',
    },
    other: { color: 'bg-slate-100 text-slate-600', label: '📄 Other' },
  };

  return (
    <div className='h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-bold text-slate-800'>
              📸 Snap & Simplify
            </h1>
            <p className='text-sm text-slate-500'>
              Photograph & understand any document
            </p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className='flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50'
          >
            <Camera size={16} />
            {uploading ? 'Uploading…' : 'Scan Doc'}
          </button>
          <input
            ref={fileRef}
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${typeBadge[selectedDoc.doc_type]?.color || typeBadge.other.color}`}
              >
                {typeBadge[selectedDoc.doc_type]?.label ||
                  typeBadge.other.label}
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
                  onClick={() => deleteDoc(selectedDoc.id)}
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
            <img
              src={selectedDoc.image_url}
              alt='Document'
              className='w-full rounded-xl mb-3 border border-slate-200'
            />
            <div className='bg-primary-50 border border-primary-100 rounded-xl p-3'>
              <h4 className='text-sm font-semibold text-primary-800 mb-1'>
                AI Summary
              </h4>
              {analyzingId === selectedDoc.id ? (
                <div className='flex items-center gap-2 text-sm text-slate-500 py-2'>
                  <Loader2 size={14} className='animate-spin' />
                  Analyzing document…
                </div>
              ) : selectedDoc.ai_summary ? (
                <>
                  <p className='text-sm text-slate-700 whitespace-pre-wrap leading-relaxed'>
                    {selectedDoc.ai_summary}
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
                  <p className='text-sm text-red-600 mb-2 flex items-center gap-1'><TriangleAlert size={14} /> {analysisError}</p>
                  <button onClick={() => analyzeDocument(selectedDoc.id)} className='text-xs text-primary-500 hover:text-primary-700 font-medium'>Retry</button>
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
          <div className='glass-card p-8 text-center'>
            <Upload size={40} className='text-slate-300 mx-auto mb-3' />
            <p className='text-slate-500 font-medium'>No documents yet</p>
            <p className='text-slate-400 text-sm mt-1'>
              Tap "Scan Doc" to photograph a bill, letter, or permit
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-3'>
            {docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className='glass-card overflow-hidden text-left hover:shadow-lg transition-shadow group'
              >
                <div className='aspect-[4/3] bg-slate-100 relative overflow-hidden'>
                  <img
                    src={doc.image_url}
                    alt='Document thumbnail'
                    className='w-full h-full object-cover'
                  />
                  <div className='absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center'>
                    <Eye
                      size={24}
                      className='text-white opacity-0 group-hover:opacity-100 transition-opacity'
                    />
                  </div>
                  {analyzingId === doc.id && (
                    <div className='absolute inset-0 bg-black/40 flex items-center justify-center'>
                      <Loader2 size={24} className='text-white animate-spin' />
                    </div>
                  )}
                </div>
                <div className='p-3'>
                  <div
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 ${typeBadge[doc.doc_type]?.color || typeBadge.other.color}`}
                  >
                    {typeBadge[doc.doc_type]?.label || typeBadge.other.label}
                  </div>
                  {doc.ai_summary ? (
                    <p className='text-xs text-slate-500 mt-1 line-clamp-2'>
                      {doc.ai_summary}
                    </p>
                  ) : (
                    <p className='text-xs text-slate-400 italic mt-1'>
                      {analyzingId === doc.id ? 'Analyzing…' : 'Tap to analyze'}
                    </p>
                  )}
                  <p className='text-xs text-slate-400 mt-1'>
                    {(() => {
                      const d = doc.createdAt || doc.created_at;
                      if (!d) return '—';
                      const dt = new Date(d);
                      return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString();
                    })()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
