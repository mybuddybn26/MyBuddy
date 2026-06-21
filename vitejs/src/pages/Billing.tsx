import { useState, useEffect } from 'react';
import { api } from '../api';
import { Coins, QrCode, ArrowRight, CheckCircle } from 'lucide-react';

interface TokenInfo {
  balance: number;
  monthly_limit: number;
  usage_percent: number;
}

const PACKS = [
  { id: 'pack_100', tokens: 100, price: 2, label: '100 Tasks — $2' },
  { id: 'pack_500', tokens: 500, price: 8, label: '500 Tasks — $8' },
  { id: 'pack_1000', tokens: 1000, price: 15, label: '1000 Tasks — $15' },
];

export function Billing() {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Load token balance on mount
  useEffect(() => {
    api
      .tokenBalance()
      .then((data) => {
        setTokenInfo({
          balance: data.balance as number,
          monthly_limit: data.monthly_limit as number,
          usage_percent: data.usage_percent as number,
        });
      })
      .catch(() => {});
  }, []);

  const handleBuy = async () => {
    if (!selectedPack) return;
    const pack = PACKS.find((p) => p.id === selectedPack);
    if (!pack) return;

    try {
      const res = await api.createCheckout(pack.id);
      setReferenceCode((res.order_id as string) || `ORDER-${Date.now()}`);
    } catch {
      alert('Failed to create order. Billing may not be configured.');
    }
  };

  const handleConfirm = async () => {
    if (!referenceCode) return;
    setConfirming(true);
    try {
      await api.confirmPayment(referenceCode);
      setConfirmed(true);
      const data = await api.tokenBalance();
      setTokenInfo({
        balance: data.balance as number,
        monthly_limit: data.monthly_limit as number,
        usage_percent: data.usage_percent as number,
      });
    } catch {
      alert('Confirmation failed');
    }
    setConfirming(false);
  };

  return (
    <div className='h-full overflow-y-auto'>
      <div className='max-w-2xl mx-auto p-4 space-y-4'>
        <h1 className='text-xl font-bold text-slate-800'>💰 Token Billing</h1>

        {/* Token Balance Card */}
        {tokenInfo && (
          <div className='glass-card p-4'>
            <div className='flex items-center gap-2 mb-3'>
              <Coins size={20} className='text-primary-500' />
              <span className='text-lg font-bold'>{tokenInfo.balance}</span>
              <span className='text-sm text-slate-500'>
                of {tokenInfo.monthly_limit} / month
              </span>
            </div>
            <div className='token-bar bg-slate-100'>
              <div
                className='token-bar-fill'
                style={{
                  width: `${Math.max(0, 100 - tokenInfo.usage_percent)}%`,
                }}
              />
            </div>
            <p className='text-xs text-slate-400 mt-1'>
              {tokenInfo.usage_percent}% used this month
            </p>
          </div>
        )}

        {/* Pack Selector */}
        <div className='glass-card p-4 space-y-3'>
          <h3 className='font-semibold text-sm text-slate-700'>Buy Tokens</h3>
          {PACKS.map((pack) => (
            <button
              key={pack.id}
              onClick={() => {
                setSelectedPack(pack.id);
                setReferenceCode('');
                setConfirmed(false);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-colors ${
                selectedPack === pack.id
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-slate-200 hover:border-primary-200'
              }`}
            >
              <div className='flex items-center gap-3'>
                <Coins size={16} className='text-primary-500' />
                <span className='text-sm font-medium'>{pack.label}</span>
              </div>
              <ArrowRight
                size={16}
                className={`text-slate-300 ${selectedPack === pack.id ? 'text-primary-500' : ''}`}
              />
            </button>
          ))}

          {selectedPack && (
            <button
              onClick={handleBuy}
              className='w-full py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors text-sm'
            >
              Pay with BIBD QuickPay
            </button>
          )}
        </div>

        {/* QR Code + Reference */}
        {referenceCode && (
          <div className='glass-card p-4 text-center space-y-3'>
            <QrCode size={48} className='text-slate-400 mx-auto' />
            <p className='text-sm text-slate-600 font-medium'>
              Scan to pay with BIBD QuickPay
            </p>
            <div className='bg-slate-100 rounded-xl p-3'>
              <p className='text-xs text-slate-500 mb-1'>Payment Reference</p>
              <p className='text-sm font-mono font-bold text-slate-700'>
                {referenceCode}
              </p>
            </div>
            <p className='text-xs text-slate-400'>
              1. Open BIBD app → Scan QR → Enter amount and reference above
              <br />
              2. After payment, click "I've Paid" below
            </p>

            {/* Phase 1 / demo: Manual confirmation */}
            <button
              onClick={handleConfirm}
              disabled={confirming || confirmed}
              className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors ${
                confirmed
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              } disabled:opacity-50`}
            >
              {confirmed ? (
                <span className='flex items-center justify-center gap-1.5'>
                  <CheckCircle size={16} />
                  Payment Confirmed
                </span>
              ) : confirming ? (
                'Confirming…'
              ) : (
                "I've Paid — Confirm"
              )}
            </button>

            {confirmed && (
              <p className='text-xs text-emerald-600 font-medium'>
                Tokens added to your balance!
              </p>
            )}
          </div>
        )}

        <p className='text-xs text-slate-400 text-center'>
          Phase 1 / demo flow. production requires BIBD merchant services integration.
        </p>
      </div>
    </div>
  );
}
