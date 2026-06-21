import { useState } from 'react';
import { login, register } from '../auth';
import { MessageCircle, Shield, Zap } from 'lucide-react';

interface LoginProps {
  onAuth: () => void;
}

export function Login({ onAuth }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [phoneEmail, setPhoneEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(phoneEmail, password, displayName || undefined);
      } else {
        await login(phoneEmail, password);
      }
      onAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-500 to-accent p-4'>
      <div className='w-full max-w-md animate-fade-in'>
        {/* Brand Header */}
        <div className='text-center mb-8'>
          <div className='text-6xl mb-3'>🤖</div>
          <h1 className='text-3xl font-bold text-white tracking-tight'>
            MyBuddy
          </h1>
          <p className='text-primary-100 text-sm mt-1'>
            Your AI-powered voice assistant
          </p>
        </div>

        {/* Login Card */}
        <div className='glass-card p-6'>
          <h2 className='text-lg font-semibold text-slate-800 mb-4'>
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className='space-y-4'>
            {isRegister && (
              <div>
                <label className='block text-sm font-medium text-slate-600 mb-1'>
                  Your Name
                </label>
                <input
                  type='text'
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder='e.g. Ahmad'
                  className='w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
                />
              </div>
            )}

            <div>
              <label className='block text-sm font-medium text-slate-600 mb-1'>
                Phone or Email
              </label>
              <input
                type='text'
                value={phoneEmail}
                onChange={(e) => setPhoneEmail(e.target.value)}
                placeholder='e.g. +673-8123456 or ali@email.com'
                required
                className='w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
              />
            </div>

            <div>
              <label className='block text-sm font-medium text-slate-600 mb-1'>
                Password
              </label>
              <input
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='Min 6 characters'
                required
                minLength={6}
                className='w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
              />
            </div>

            {error && (
              <p className='text-sm text-danger bg-red-50 px-3 py-2 rounded-lg'>
                {error}
              </p>
            )}

            <button
              type='submit'
              disabled={loading}
              className='w-full py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm'
            >
              {loading
                ? 'Please wait…'
                : isRegister
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>

          <p className='text-center text-sm text-slate-500 mt-4'>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className='text-primary-600 font-medium hover:underline'
            >
              {isRegister ? 'Sign In' : 'Create One'}
            </button>
          </p>
        </div>

        {/* Features */}
        <div className='mt-6 grid grid-cols-3 gap-3'>
          {[
            { icon: MessageCircle, text: 'Voice Chat' },
            { icon: Shield, text: 'Secure' },
            { icon: Zap, text: 'AI Powered' },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className='flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/10 backdrop-blur-sm'
            >
              <Icon size={20} className='text-white/80' />
              <span className='text-xs text-white/70'>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
