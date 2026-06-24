import { useState, useEffect } from 'react';
import { api } from '../api';
import { Coins, CheckCircle, Star } from 'lucide-react';

interface CreditInfo {
  balance: number;
  monthly_limit: number;
  usage_percent: number;
  plan: string;
}

const PLANS = [
  {
    tier: 'free',
    name: 'Free',
    priceLabel: 'BND $0',
    color: 'border-slate-300',
    bg: 'bg-slate-50',
    features: ['Basic chat', 'Limited voice & documents'],
  },
  {
    tier: 'plus',
    name: 'Plus',
    priceLabel: 'BND $2.99',
    color: 'border-primary-300',
    bg: 'bg-primary-50',
    features: [
      'More voice',
      'More document scans',
      'Vendor mode & basic reports',
      'Better daily usage',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceLabel: 'BND $5',
    color: 'border-emerald-300',
    bg: 'bg-emerald-50',
    features: [
      'Highest voice allowance',
      'More documents',
      'Vendor reports',
      'Advanced exports',
      'Longer memory',
    ],
  },
];

export function Billing() {
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);

  useEffect(() => {
    api
      .tokenBalance()
      .then((data) => {
        setCreditInfo({
          balance: data.balance as number,
          monthly_limit: data.monthly_limit as number,
          usage_percent: data.usage_percent as number,
          plan: (data.plan as string) || 'free',
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className='min-h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        <h1 className='text-xl font-bold text-slate-800'>Buddy Credits</h1>

        {/* Credits Balance Card */}
        {creditInfo && (
          <div className='glass-card p-4'>
            <div className='flex items-center gap-2 mb-3'>
              <Coins size={20} className='text-primary-500' />
              <span className='text-lg font-bold'>{creditInfo.balance}</span>
              <span className='text-sm text-slate-500'>
                of {creditInfo.monthly_limit} / month
              </span>
            </div>
            <div className='token-bar bg-slate-100'>
              <div
                className='token-bar-fill'
                style={{
                  width: `${Math.max(0, 100 - creditInfo.usage_percent)}%`,
                }}
              />
            </div>
            <p className='text-xs text-slate-400 mt-1'>
              {creditInfo.usage_percent}% used this month &middot; Current plan:{' '}
              {creditInfo.plan === 'free'
                ? 'Free'
                : creditInfo.plan === 'plus'
                  ? 'Plus'
                  : 'Pro'}
            </p>
          </div>
        )}

        {/* Plans */}
        <h2 className='font-semibold text-slate-700'>Subscription Plans</h2>
        <div className='grid gap-3'>
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`glass-card p-4 border-2 ${plan.color} ${plan.bg}`}
            >
              <div className='flex items-center justify-between mb-2'>
                <div className='flex items-center gap-2'>
                  <Star size={18} className='text-primary-500' />
                  <span className='font-bold text-slate-800'>{plan.name}</span>
                </div>
                <span className='font-bold text-lg text-primary-700'>
                  {plan.priceLabel}
                </span>
              </div>
              <div className='space-y-1'>
                {plan.features.map((f, i) => (
                  <div
                    key={i}
                    className='flex items-center gap-2 text-sm text-slate-600'
                  >
                    <CheckCircle size={14} className='text-emerald-500' />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Credit Costs Explained */}
        <div className='glass-card p-4'>
          <h3 className='font-semibold text-sm text-slate-700 mb-2'>
            How Buddy Credits Work
          </h3>
          <div className='space-y-1.5 text-xs text-slate-500'>
            <p>
              <span className='font-medium text-slate-600'>Text chat</span> uses
              fewer credits &mdash; 1 credit per message for English and
              standard Malay.
            </p>
            <p>
              <span className='font-medium text-slate-600'>Voice</span> uses
              more credits because it includes speech processing (speech-to-text
              and text-to-speech).
            </p>
            <p>
              <span className='font-medium text-slate-600'>Brunei Malay</span>{' '}
              may use more credits because it uses higher-quality language
              routing for accurate local responses.
            </p>
            <p>
              <span className='font-medium text-slate-600'>
                Documents and reports
              </span>{' '}
              cost more as they use advanced AI analysis.
            </p>
          </div>
        </div>

        <p className='text-xs text-slate-400 text-center'>
          Maximum plan: BND $5/month. Payments coming soon.
        </p>
      </div>
    </div>
  );
}
