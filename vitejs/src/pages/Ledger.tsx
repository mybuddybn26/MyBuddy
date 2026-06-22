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

export function Ledger() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const [loading, setLoading] = useState(true);
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const since = new Date(now);
      if (period === 'day') {
        since.setHours(0, 0, 0, 0);
      } else {
        since.setDate(now.getDate() - now.getDay());
        since.setHours(0, 0, 0, 0);
      }
      const [txRes, sumRes] = await Promise.all([
        api.transactions({ limit: '30', from: since.toISOString() }),
        api.transactionSummary(period),
      ]);
      setTransactions(txRes.data as unknown as Transaction[]);
      setSummary(sumRes as unknown as Summary);
    } catch {
      /* handle gracefully */
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const deleteTx = async (id: string) => {
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
  };

  const saveEdit = async (id: string) => {
    try {
      const amt = parseFloat(editAmount);
      if (isNaN(amt) || amt <= 0) return;
      await api.updateTransaction(id, { amount: amt });
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
    <div className='h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-bold text-slate-800'>
              📒 Revenue Ledger
            </h1>
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
              Loading…
            </div>
          ) : transactions.length === 0 ? (
            <div className='p-8 text-center'>
              <Plus size={32} className='text-slate-300 mx-auto mb-2' />
              <p className='text-slate-400 text-sm'>No transactions yet</p>
              <p className='text-slate-400 text-xs mt-1'>
                Tell MyBuddy: "I sold 3 boxes of kuih for $10 each"
              </p>
            </div>
          ) : (
            transactions.map((tx) => {
              const Icon = typeIcons[tx.type] || DollarSign;
              return (
                <div
                  key={tx.id}
                  className='flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors group'
                >
                  <div className={`p-2 rounded-lg ${typeColors[tx.type]}`}>
                    <Icon size={16} />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium text-slate-700 truncate'>
                      {tx.description}
                    </p>
                    <p className='text-xs text-slate-400'>
                      {tx.category} ·{' '}
                      {(() => {
                        const d = tx.transactedAt || tx.transacted_at;
                        if (!d) return '—';
                        const dt = new Date(d);
                        return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString();
                      })()}
                    </p>
                  </div>
                  {editingTx === tx.id ? (
                    <div className='flex items-center gap-1'>
                      <input
                        type='number'
                        step='0.01'
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className='w-20 px-2 py-1 border rounded text-sm'
                      />
                      <button
                        onClick={() => saveEdit(tx.id)}
                        className='text-xs text-primary-600 font-medium'
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`text-sm font-semibold ${
                        tx.type === 'sale' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {tx.type === 'sale' ? '+' : '-'}$
                      {parseFloat(tx.amount).toFixed(2)}
                    </span>
                  )}
                  <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity'>
                    <button
                      onClick={() => startEdit(tx)}
                      className='p-1 text-slate-400 hover:text-primary-500'
                      aria-label='Edit'
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteTx(tx.id)}
                      className='p-1 text-slate-400 hover:text-red-500'
                      aria-label='Delete'
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
