import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { LoaderCircle, Brain, Trash2, Plus, X, Pencil, TriangleAlert } from 'lucide-react';

interface Memory {
  id: string;
  type: string;
  content: string;
  importance: number;
}

export function MemorySection() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');

  const load = useCallback(() => {
    api.memories()
      .then((res) => setMemories(res.data as Memory[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    try {
      await api.createMemory({ type: 'preference', content: newContent.trim(), importance: 3 });
      setNewContent('');
      setAdding(false);
      load();
    } catch {
      setError('Failed to save memory');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!newContent.trim()) return;
    try {
      await api.updateMemory(id, { content: newContent.trim() });
      setNewContent('');
      setEditing(null);
      load();
    } catch {
      setError('Failed to update memory');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      load();
    } catch {
      setError('Failed to delete memory');
    }
  };

  if (loading) return <div className='flex items-center justify-center py-8'><LoaderCircle size={20} className='animate-spin text-primary-400' /></div>;
  if (error) return <div className='flex items-center gap-2 py-4 text-sm text-slate-400'><TriangleAlert size={16} /><span>Could not load memories.</span></div>;

  return (
    <div className='space-y-4'>
      {memories.length === 0 && !adding && (
        <p className='text-sm text-slate-400 py-2'>No memories saved yet. Try saying &quot;Remember that I prefer short answers.&quot; to Buddy.</p>
      )}

      {memories.map((m) => (
        <div key={m.id} className='bg-white rounded-lg border border-slate-100 px-3 py-2 flex items-start gap-2'>
          <div className='flex-1 min-w-0'>
            {editing === m.id ? (
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className='flex-1 px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary-400'
                  placeholder='Edit memory...'
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdate(m.id)}
                />
                <button onClick={() => handleUpdate(m.id)} className='text-xs text-primary-500 hover:text-primary-700 font-medium'>Save</button>
                <button onClick={() => { setEditing(null); setNewContent(''); }} className='p-0.5 text-slate-400 hover:text-slate-600'><X size={14} /></button>
              </div>
            ) : (
              <div className='flex items-start gap-2'>
                <span className='text-sm text-slate-700 leading-relaxed break-words'>{m.content}</span>
                <div className='flex items-center gap-1 ml-auto flex-shrink-0'>
                  <span className='text-xs text-slate-400'>★{m.importance}</span>
                </div>
              </div>
            )}
          </div>
          {editing !== m.id && (
            <div className='flex items-center gap-0.5 flex-shrink-0'>
              <button onClick={() => { setEditing(m.id); setNewContent(m.content); }} className='p-1 text-slate-300 hover:text-primary-500 rounded' aria-label='Edit memory'><Pencil size={14} /></button>
              <button onClick={() => handleDelete(m.id)} className='p-1 text-slate-300 hover:text-red-500 rounded' aria-label='Delete memory'><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className='flex gap-2'>
          <input
            type='text'
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className='flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400'
            placeholder='I prefer short answers...'
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <button onClick={handleAdd} className='px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors'>Save</button>
          <button onClick={() => { setAdding(false); setNewContent(''); }} className='p-1.5 text-slate-400 hover:text-slate-600'><X size={18} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className='flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-700 font-medium'>
          <Plus size={16} /> Add memory
        </button>
      )}
    </div>
  );
}
