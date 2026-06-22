import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import {
  Plus,
  Trash2,
  Save,
  Archive,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';

interface LineItem {
  id: string;
  category: string;
  allocated_amount: number;
  spent_amount: number;
}

interface Budget {
  id: string;
  title: string;
  budgetType: string;
  period: string;
  totalAmount: string;
  lineItems: LineItem[];
  status: string;
  source: string;
}

function formatPeriod(p: string): string {
  return p === 'weekly' ? 'Weekly' : p === 'monthly' ? 'Monthly' : 'One-time';
}

export function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selected, setSelected] = useState<Budget | null>(null);
  const [editingItems, setEditingItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  // AI bubble state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiProposal, setAiProposal] = useState<{
    summary: string;
    proposed_line_items: LineItem[];
    proposed_total: number;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Load budgets
  const loadBudgets = useCallback(() => {
    api
      .budgets()
      .then((res) => {
        setBudgets(res.data as unknown as Budget[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  // Open budget editor
  const openBudget = (b: Budget) => {
    setSelected(b);
    setEditingItems(b.lineItems.map((item) => ({ ...item })));
    setAiProposal(null);
  };

  // Edit a cell
  const updateItem = (
    id: string,
    field: keyof LineItem,
    value: string | number,
  ) => {
    setEditingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  // Add new row
  const addRow = () => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      category: '',
      allocated_amount: 0,
      spent_amount: 0,
    };
    setEditingItems((prev) => [...prev, newItem]);
  };

  // Delete row
  const removeRow = (id: string) => {
    setEditingItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Save
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = (await api.updateBudget(selected.id, {
        line_items: editingItems,
        source: selected.source === 'ai_generated' ? 'manual' : selected.source,
      })) as unknown as Budget;
      setSelected(updated);
      setBudgets((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
    } catch {
      alert('Save failed');
    }
    setSaving(false);
  };

  // Archive
  const archive = async () => {
    if (!selected) return;
    try {
      await api.updateBudget(selected.id, { status: 'archived' });
      setBudgets((prev) => prev.filter((b) => b.id !== selected.id));
      setSelected(null);
    } catch {
      alert('Archive failed');
    }
  };

  // Delete
  const deleteBudget = async (id: string) => {
    if (!confirm('Permanently delete this budget?')) return;
    try {
      await api.deleteBudget(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      alert('Delete failed');
    }
  };

  // Voice recording (reuse same pattern as Chat.tsx)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size < 500) return;
        try {
          const result = await api.transcribe(blob);
          if (result.transcript) {
            setAiInput((prev) => prev + ' ' + result.transcript);
          }
        } catch {
          /* ignore */
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // AI Edit request
  const sendAiEdit = async () => {
    if (!selected || !aiInput.trim()) return;
    setAiLoading(true);
    setAiInput('');
    try {
      const proposal = await api.aiEditBudget(selected.id, aiInput.trim());
      setAiProposal(
        proposal as unknown as {
          summary: string;
          proposed_line_items: LineItem[];
          proposed_total: number;
        },
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'AI edit failed');
    }
    setAiLoading(false);
  };

  // Confirm AI proposal
  const confirmProposal = async () => {
    if (!selected || !aiProposal) return;
    setSaving(true);
    try {
      const updated = (await api.updateBudget(selected.id, {
        line_items: aiProposal.proposed_line_items,
        source: 'ai_edited',
      })) as unknown as Budget;
      setSelected(updated);
      setEditingItems(aiProposal.proposed_line_items);
      setAiProposal(null);
      setBudgets((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
    } catch {
      alert('Failed to apply AI edits');
    }
    setSaving(false);
  };

  const total = editingItems.reduce((s, i) => s + i.allocated_amount, 0);

  return (
    <div className='h-full overflow-y-auto'>
      <div className='max-w-3xl mx-auto p-4 space-y-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-bold text-slate-800'>
              📊 Budget Sheets
            </h1>
            <p className='text-sm text-slate-500'>
              {budgets.length} active{' '}
              {budgets.length === 1 ? 'budget' : 'budgets'}
            </p>
          </div>
        </div>

        {/* Budget Grid vs Editor */}
        {!selected ? (
          <div className='grid gap-3'>
            {budgets.length === 0 ? (
              <div className='glass-card p-8 text-center'>
                <p className='text-slate-500 font-medium'>No budgets yet</p>
                <p className='text-slate-400 text-sm mt-1'>
                  Ask MyBuddy: "Make me a $100 weekly food budget"
                </p>
              </div>
            ) : (
              budgets.map((b) => (
                <button
                  key={b.id}
                  onClick={() => openBudget(b)}
                  className='glass-card p-4 text-left hover:shadow-md transition-shadow flex items-center justify-between'
                >
                  <div>
                    <h3 className='font-semibold text-sm text-slate-800'>
                      {b.title}
                    </h3>
                    <p className='text-xs text-slate-400 mt-0.5'>
                      {formatPeriod(b.period)} ·{' '}
                      {b.budgetType === 'recurring' ? 'Recurring' : 'Snapshot'}{' '}
                      · {b.source?.replace('_', ' ') || b.source}
                    </p>
                  </div>
                  <div className='text-right'>
                    <span className='text-sm font-bold text-slate-700'>
                      ${Number(b.totalAmount).toFixed(2)}
                    </span>
                    <br />
                    <span className='text-xs text-slate-400'>
                      {b.lineItems?.length || 0} items
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Back button */}
            <button
              onClick={() => {
                setSelected(null);
                setAiProposal(null);
              }}
              className='text-sm text-primary-500 hover:text-primary-700'
            >
              ← Back to budgets
            </button>

            {/* Editor header */}
            <div className='flex items-center justify-between'>
              <input
                value={selected.title}
                onChange={(e) =>
                  setSelected({ ...selected, title: e.target.value })
                }
                className='text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-400 focus:outline-none px-1'
              />
              <div className='flex items-center gap-1'>
                <button
                  onClick={save}
                  disabled={saving}
                  className='p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg'
                  aria-label='Save'
                >
                  <Save size={16} />
                </button>
                <button
                  onClick={archive}
                  className='p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg'
                  aria-label='Archive'
                >
                  <Archive size={16} />
                </button>
                <button
                  onClick={() => deleteBudget(selected.id)}
                  className='p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg'
                  aria-label='Delete'
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Period and type info */}
            <div className='flex gap-2 text-xs text-slate-400'>
              <span className='bg-slate-100 px-2 py-0.5 rounded'>
                {formatPeriod(selected.period)}
              </span>
              <span className='bg-slate-100 px-2 py-0.5 rounded'>
                {selected.budgetType}
              </span>
              <span className='bg-slate-100 px-2 py-0.5 rounded'>
                Total: ${total.toFixed(2)}
              </span>
            </div>

            {/* AI Proposal Diff */}
            {aiProposal && (
              <div className='bg-primary-50 border border-primary-200 rounded-xl p-4 space-y-2'>
                <p className='text-sm font-medium text-primary-800'>
                  🤖 AI Suggestion: {aiProposal.summary}
                </p>
                <p className='text-xs text-primary-600'>
                  New total: ${aiProposal.proposed_total.toFixed(2)}
                  (was: ${total.toFixed(2)})
                </p>
                <div className='flex gap-2'>
                  <button
                    onClick={confirmProposal}
                    disabled={saving}
                    className='px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50'
                  >
                    {saving ? 'Applying…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setAiProposal(null)}
                    className='px-4 py-1.5 text-slate-600 text-sm hover:bg-slate-100 rounded-lg'
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Editable spreadsheet */}
            <div className='glass-card overflow-hidden'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-slate-200 bg-slate-50'>
                    <th className='text-left px-3 py-2 text-xs font-semibold text-slate-500'>
                      Category
                    </th>
                    <th className='text-right px-3 py-2 text-xs font-semibold text-slate-500 w-28'>
                      Allocated
                    </th>
                    <th className='text-right px-3 py-2 text-xs font-semibold text-slate-500 w-28'>
                      Spent
                    </th>
                    <th className='w-8' />
                  </tr>
                </thead>
                <tbody>
                  {editingItems.map((item) => (
                    <tr
                      key={item.id}
                      className='border-b border-slate-100 hover:bg-slate-50/50'
                    >
                      <td className='px-3 py-1.5'>
                        <input
                          value={item.category}
                          onChange={(e) =>
                            updateItem(item.id, 'category', e.target.value)
                          }
                          className='w-full bg-transparent text-slate-700 focus:outline-none focus:border-b focus:border-primary-300'
                        />
                      </td>
                      <td className='px-3 py-1.5'>
                        <input
                          type='number'
                          step='0.01'
                          value={item.allocated_amount || ''}
                          onChange={(e) =>
                            updateItem(
                              item.id,
                              'allocated_amount',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className='w-full text-right font-mono bg-transparent text-emerald-600 focus:outline-none focus:border-b focus:border-primary-300'
                        />
                      </td>
                      <td className='px-3 py-1.5'>
                        <input
                          type='number'
                          step='0.01'
                          value={item.spent_amount || ''}
                          onChange={(e) =>
                            updateItem(
                              item.id,
                              'spent_amount',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className='w-full text-right font-mono bg-transparent text-slate-400 focus:outline-none focus:border-b focus:border-primary-300'
                        />
                      </td>
                      <td className='px-1'>
                        <button
                          onClick={() => removeRow(item.id)}
                          className='p-1 text-slate-300 hover:text-red-400'
                          aria-label='Remove row'
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className='bg-slate-50'>
                    <td className='px-3 py-1.5'>
                      <button
                        onClick={addRow}
                        className='flex items-center gap-1 text-xs text-primary-500 hover:text-primary-700'
                      >
                        <Plus size={14} /> Add item
                      </button>
                    </td>
                    <td className='px-3 py-1.5 text-right font-bold font-mono text-emerald-700'>
                      ${total.toFixed(2)}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* Floating AI Assistant Bubble */}
        {selected && (
          <div className='fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2'>
            {aiOpen ? (
              <div className='bg-white rounded-xl shadow-xl border border-slate-200 w-80 p-3 space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-semibold text-slate-600'>
                    🤖 AI Budget Assistant
                  </span>
                  <button
                    onClick={() => setAiOpen(false)}
                    className='text-slate-400 hover:text-slate-600 text-xs'
                  >
                    ✕
                  </button>
                </div>
                <div className='flex gap-1'>
                  <input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder='e.g. move $20 from transport to food'
                    disabled={aiLoading}
                    className='flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-primary-400 focus:outline-none'
                    onKeyDown={(e) => e.key === 'Enter' && sendAiEdit()}
                  />
                  <button
                    onClick={toggleRecording}
                    className={`p-1.5 rounded-lg ${isRecording ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-primary-50 hover:text-primary-500'}`}
                    aria-label={isRecording ? 'Tap to stop' : 'Tap to speak'}
                  >
                    {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                  <button
                    onClick={sendAiEdit}
                    disabled={aiLoading || !aiInput.trim()}
                    className='p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50'
                  >
                    {aiLoading ? (
                      <Loader2 size={16} className='animate-spin' />
                    ) : (
                      '→'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAiOpen(true)}
                className='w-12 h-12 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-all flex items-center justify-center animate-pulse'
                aria-label='Open AI assistant'
              >
                🤖
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
