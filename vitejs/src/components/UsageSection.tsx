import { useState, useEffect } from 'react';
import { api } from '../api';
import { LoaderCircle, Coins } from 'lucide-react';

export function UsageSection() {
  const [usage, setUsage] = useState<{
    summary: { totalRequests: number; totalTokens: number; estimatedCost: string };
    byFeature: Array<{ feature: string; tokens: number }>;
    byModel: Array<{ model: string; tokens: number }>;
    daily: Array<{ date: string; tokens: number; cost: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.usageMe()
      .then(setUsage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-8'>
        <LoaderCircle size={20} className='animate-spin text-primary-400' />
      </div>
    );
  }

  if (!usage) return null;

  const cost = parseFloat(usage.summary.estimatedCost);

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className='bg-white rounded-xl border border-slate-200 p-3'>
          <div className='text-xs text-slate-400 mb-0.5'>Requests</div>
          <div className='text-lg font-bold text-slate-800'>{usage.summary.totalRequests}</div>
        </div>
        <div className='bg-white rounded-xl border border-slate-200 p-3'>
          <div className='text-xs text-slate-400 mb-0.5'>Total Tokens</div>
          <div className='text-lg font-bold text-slate-800'>{usage.summary.totalTokens.toLocaleString()}</div>
        </div>
        <div className='bg-white rounded-xl border border-slate-200 p-3'>
          <div className='text-xs text-slate-400 mb-0.5'>Est. Cost</div>
          <div className='text-lg font-bold text-slate-800'>
            ${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}
          </div>
        </div>
        <div className='bg-white rounded-xl border border-slate-200 p-3'>
          <div className='text-xs text-slate-400 mb-0.5'>Avg per Request</div>
          <div className='text-lg font-bold text-slate-800'>
            {usage.summary.totalRequests > 0
              ? Math.round(usage.summary.totalTokens / usage.summary.totalRequests)
              : 0}
          </div>
        </div>
      </div>

      {usage.byFeature.length > 0 && (
        <div>
          <h4 className='text-sm font-semibold text-slate-600 mb-2'>Usage by Feature</h4>
          <div className='space-y-1.5'>
            {usage.byFeature.map((f) => (
              <div key={f.feature} className='flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2 text-sm'>
                <span className='text-slate-700 capitalize'>{f.feature}</span>
                <span className='text-slate-500 font-mono'>{f.tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {usage.byModel.length > 0 && (
        <div>
          <h4 className='text-sm font-semibold text-slate-600 mb-2'>Usage by Model</h4>
          <div className='space-y-1.5'>
            {usage.byModel.map((m) => (
              <div key={m.model} className='flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2 text-sm'>
                <span className='text-slate-700 font-mono text-xs'>{m.model}</span>
                <span className='text-slate-500 font-mono'>{m.tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
