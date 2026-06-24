import { useState, useEffect } from 'react';
import { api } from '../api';
import { Save, User, Globe, Brain, Coins } from 'lucide-react';

interface Persona {
  name: string;
  language: string;
  tone: string;
  dialect: string;
  voice_id?: string;
}

interface TokenInfo {
  balance: number;
  monthly_limit: number;
  usage_percent: number;
  plan: string;
}

import { MemorySection } from '../components/MemorySection';

export function Settings() {
  const [persona, setPersona] = useState<Persona>({
    name: 'Buddy',
    language: 'en',
    tone: 'casual',
    dialect: 'standard',
  });
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getPersona()
      .then((data) => setPersona(data as unknown as Persona))
      .catch(() => {});
    api
      .tokenBalance()
      .then((data) => setTokenInfo(data as unknown as TokenInfo))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePersona(persona as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    }
    setSaving(false);
  };

  const languages = [
    { value: 'en', label: '🇬🇧 English' },
    { value: 'ms', label: '🇲🇾 Bahasa Melayu' },
    { value: 'zh', label: '🇨🇳 中文 (Mandarin)' },
    { value: 'mixed', label: '🌏 Mixed' },
  ];

  return (
    <div className='min-h-full overflow-y-auto'>
      <div className='max-w-lg mx-auto p-4 space-y-5'>
        <div>
          <h1 className='text-xl font-bold text-slate-800'>⚙️ Settings</h1>
          <p className='text-sm text-slate-500'>Customize your AI assistant</p>
        </div>

        {/* AI Persona */}
        <div className='glass-card p-5 space-y-4'>
          <h2 className='flex items-center gap-2 font-semibold text-slate-700'>
            <User size={18} className='text-primary-500' />
            AI Persona
          </h2>

          {/* Name */}
          <div>
            <label className='block text-sm font-medium text-slate-600 mb-1'>
              AI Name
            </label>
            <input
              type='text'
              value={persona.name}
              onChange={(e) => setPersona({ ...persona, name: e.target.value })}
              placeholder='e.g. Buddy, Kawan, 小助手'
              className='w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
            />
            <p className='text-xs text-slate-400 mt-1'>
              Your AI will introduce itself with this name
            </p>
          </div>

          {/* Language */}
          <div>
            <label className='flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2'>
              <Globe size={14} />
              Language
            </label>
            <div className='grid grid-cols-2 gap-2'>
              {languages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() =>
                    setPersona({ ...persona, language: lang.value })
                  }
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    persona.language === lang.value
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-primary-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone and dialect are auto-detected — removed from Settings UI */}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className='w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm'
          >
            <Save size={16} />
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Buddy Credits */}
        {tokenInfo && (
          <div className='glass-card p-5'>
            <h2 className='flex items-center gap-2 font-semibold text-slate-700 mb-3'>
              <Coins size={18} className='text-primary-500' />
              Buddy Credits
            </h2>
            <div className='flex items-baseline justify-between mb-2'>
              <span className='text-3xl font-bold text-primary-600'>
                {tokenInfo.balance}
              </span>
              <span className='text-sm text-slate-400'>
                of {tokenInfo.monthly_limit} / month
              </span>
            </div>
            <div className='token-bar mb-3'>
              <div
                className='token-bar-fill'
                style={{
                  width: `${Math.max(0, 100 - tokenInfo.usage_percent)}%`,
                }}
              />
            </div>
            <p className='text-xs text-slate-400'>
              {tokenInfo.usage_percent}% used this month.{' '}
              {tokenInfo.plan === 'free'
                ? 'Free'
                : tokenInfo.plan === 'plus'
                  ? 'Plus'
                  : 'Pro'}{' '}
              plan.
            </p>
          </div>
        )}
        {/* ─── Memory Section ─── */}
        <div className='glass-card p-5 space-y-4'>
          <div className='flex items-center gap-2'>
            <Brain size={18} className='text-primary-500' />
            <h3 className='text-sm font-bold text-slate-700'>Memory</h3>
          </div>
          <MemorySection />
        </div>
      </div>
    </div>
  );
}
