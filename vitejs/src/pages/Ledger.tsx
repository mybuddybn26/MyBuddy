import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  AlertTriangle,
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'sale' | 'expense' | 'refund';
  amount: string;
  description: string;
  category: string;
  transactedAt?: string;
  transacted_at?: string;
}

interface Summary {
  period: string;
  sales: { total: number; count: number };
  expenses: { total: number; count: number };
  net_revenue: number;
}

const TX_TYPES = ['sale', 'expense', 'refund'] as const;

export function Ledger() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);

  // ─── Add form state ───
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<'sale' | 'expense' | 'refund'>('sale');
  const [addAmount, setAddAmount] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [adding, setAdding] = useState(false);

  // ─── Edit state ───
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // ─── Confirm delete state ───
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '30' };
      if (filterType) params.type = filterType;
      const [txRes, sumRes] = await Promise.all([
        api.transactions(params),
        api.transactionSummary(period),
      ]);
      setTransactions(txRes.data as unknown as Transaction[]);
      setSummary(sumRes as unknown as Summary);
    } catch {
      /* handle gracefully */
    }
    setLoading(false);
  }, [period, filterType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    const amt = parseFloat(addAmount);
    if (!addDesc.trim() || isNaN(amt) || amt <= 0) return;
    setAdding(true);
    try {
      await api.createTransaction({
        type: addType,
        amount: amt,
        description: addDesc.trim(),
        category: addCategory.trim() || 'general',
      });
      setShowAdd(false);
      setAddAmount('');
      setAddDesc('');
      setAddCategory('');
      setAddType('sale');
      loadData();
    } catch {
      alert('Failed to create transaction');
    }
    setAdding(false);
  };

  const confirmDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const executeDelete = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert('Failed to delete transaction');
    }
  };

  const startEdit = (tx: Transaction) => {
    setEditingTx(tx.id);
    setEditAmount(tx.amount);
    setEditDesc(tx.description);
  };

  const saveEdit = async (id: string) => {
    try {
      const amt = parseFloat(editAmount);
      if (isNaN(amt) || amt <= 0) return;
      await api.updateTransaction(id, {
        amount: amt,
        description: editDesc.trim(),
      });
      setEditingTx(null);
      loadData();
    } catch {
      alert('Failed to update');
    }
  };

  const typeColors: Record<string, string> = {
    sale: 'text-success bg-emerald-50',
    expense: 'text-danger bg-red-50',
    refund: 'text-warning bg-amber-50',
  };

  const typeIcons: Record<string, typeof TrendingUp> = {
    sale: TrendingUp,
    expense: TrendingDown,
    refund: RefreshCw,
  };

  return (
    <div className='min-h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-bold text-slate-800'>Ledger</h1>
            <p className='text-sm text-slate-500'>
              Track your sales & expenses
            </p>
          </div>
          <div className='flex gap-1 bg-slate-100 rounded-xl p-1'>
            {(['day', 'week'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p === 'day' ? 'Today' : 'This Week'}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className='grid grid-cols-3 gap-3'>
            <div className='glass-card p-4 text-center'>
              <TrendingUp size={20} className='text-success mx-auto mb-1' />
              <p className='text-lg font-bold text-success'>
                ${summary.sales.total.toFixed(2)}
              </p>
              <p className='text-xs text-slate-500'>
                {summary.sales.count} sales
              </p>
            </div>
            <div className='glass-card p-4 text-center'>
              <TrendingDown size={20} className='text-danger mx-auto mb-1' />
              <p className='text-lg font-bold text-danger'>
                ${summary.expenses.total.toFixed(2)}
              </p>
              <p className='text-xs text-slate-500'>
                {summary.expenses.count} expenses
              </p>
            </div>
            <div className='glass-card p-4 text-center'>
              <DollarSign size={20} className='text-primary-500 mx-auto mb-1' />
              <p
                className={`text-lg font-bold ${summary.net_revenue >= 0 ? 'text-success' : 'text-danger'}`}
              >
                ${summary.net_revenue.toFixed(2)}
              </p>
              <p className='text-xs text-slate-500'>Net Revenue</p>
            </div>
          </div>
        )}

        {/* Add Transaction Button + Filter Tabs */}
        <div className='flex items-center justify-between gap-2'>
          <div className='flex gap-1 bg-slate-100 rounded-xl p-1'>
            {[
              { value: null, label: 'All' },
              { value: 'sale', label: 'Sales' },
              { value: 'expense', label: 'Expenses' },
              { value: 'refund', label: 'Refunds' },
            ].map((f) => (
              <button
                key={f.label}
                onClick={() => setFilterType(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterType === f.value
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className='flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors'
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {/* Add Transaction Form */}
        {showAdd && (
          <div className='glass-card p-4 space-y-3'>
            <div className='flex gap-2'>
              {TX_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setAddType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all border ${
                    addType === t
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className='flex gap-2'>
              <input
                type='number'
                step='0.01'
                min='0.01'
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder='Amount ($)'
                className='flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400'
              />
              <input
                type='text'
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                placeholder='Category (optional)'
                className='flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400'
              />
            </div>
            <input
              type='text'
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder='Description'
              className='w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400'
            />
            <button
              onClick={handleAdd}
              disabled={adding || !addDesc.trim()}
              className='w-full py-2 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm'
            >
              {adding ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        )}

        {/* Transaction List */}
        <div className='glass-card divide-y divide-slate-100'>
          <div className='p-3 flex items-center justify-between'>
            <h3 className='font-semibold text-sm text-slate-700'>
              Recent Transactions
            </h3>
            <button
              onClick={loadData}
              className='text-slate-400 hover:text-primary-500 transition-colors'
              aria-label='Refresh'
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div className='p-8 text-center text-slate-400 text-sm'>
              Loading...
            </div>
          ) : transactions.length === 0 ? (
            <div className='p-8 text-center'>
              <Plus size={32} className='text-slate-300 mx-auto mb-2' />
              <p className='text-slate-400 text-sm'>No transactions yet</p>
              <p className='text-slate-400 text-xs mt-1'>
                Tell Buddy: "I sold 3 boxes of kuih for $10 each"
              </p>
            </div>
          ) : (
            transactions.map((tx) => {
              const Icon = typeIcons[tx.type] || DollarSign;
              const isEditing = editingTx === tx.id;
              return (
                <div
                  key={tx.id}
                  className='flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors group'
                >
                  <div className={`p-2 rounded-lg ${typeColors[tx.type]}`}>
                    <Icon size={16} />
                  </div>
                  <div className='flex-1 min-w-0'>
                    {isEditing ? (
                      <div className='space-y-1'>
                        <input
                          type='text'
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className='w-full px-2 py-1 border rounded text-sm'
                        />
                        <input
                          type='number'
                          step='0.01'
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className='w-24 px-2 py-1 border rounded text-sm'
                        />
                      </div>
                    ) : (
                      <>
                        <p className='text-sm font-medium text-slate-700 truncate'>
                          {tx.description}
                        </p>
                        <p className='text-xs text-slate-400'>
                          {tx.category} &middot;{' '}
                          {(() => {
                            const d = tx.transactedAt || tx.transacted_at;
                            if (!d) return '';
                            const dt = new Date(d);
                            return isNaN(dt.getTime())
                              ? ''
                              : dt.toLocaleDateString();
                          })()}
                        </p>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <button
                      onClick={() => saveEdit(tx.id)}
                      className='text-xs px-2 py-1 bg-primary-500 text-white rounded font-medium'
                    >
                      Save
                    </button>
                  ) : (
                    <span
                      className={`text-sm font-semibold ${
                        tx.type === 'sale'
                          ? 'text-success'
                          : tx.type === 'expense'
                            ? 'text-danger'
                            : 'text-warning'
                      }`}
                    >
                      {tx.type === 'sale' ? '+' : '-'}$
                      {parseFloat(tx.amount).toFixed(2)}
                    </span>
                  )}
                  {!isEditing && (
                    <div className='flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity'>
                      <button
                        onClick={() => startEdit(tx)}
                        className='p-1 text-slate-400 hover:text-primary-500'
                        aria-label='Edit'
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => confirmDelete(tx.id)}
                        className='p-1 text-slate-400 hover:text-red-500'
                        aria-label='Delete'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ─── Delete Confirmation Dialog ─── */}
        {deleteConfirmId && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in'>
            <div className='bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full space-y-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2.5 rounded-full bg-red-50'>
                  <AlertTriangle size={20} className='text-danger' />
                </div>
                <h3 className='font-semibold text-slate-800 text-base'>
                  Delete transaction?
                </h3>
              </div>
              <p className='text-sm text-slate-500 leading-relaxed'>
                Are you sure you want to delete this transaction? This cannot be
                undone.
              </p>
              <div className='flex gap-2'>
                <button
                  onClick={cancelDelete}
                  className='flex-1 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm'
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
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
