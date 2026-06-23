import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getUserInfo, logout } from '../auth';
import { api } from '../api';
import {
  MessageCircle,
  BookOpen,
  FileText,
  Coins,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: MessageCircle, label: 'Chat', end: true },
  { to: '/ledger', icon: BookOpen, label: 'Ledger' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/budgets', icon: ClipboardList, label: 'Budgets' },
  { to: '/billing', icon: Coins, label: 'Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout() {
  const user = getUserInfo();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  useEffect(() => {
    api
      .tokenBalance()
      .then((data) => {
        setTokenBalance(data.balance as number);
      })
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className='flex h-screen bg-surface overflow-hidden'>
      {/* ─── Desktop Sidebar ─── */}
      <nav className='hidden md:flex flex-col w-64 bg-gradient-to-b from-primary-800 via-primary-700 to-primary-900 backdrop-blur-sm'>
        {/* Brand */}
        <div className='p-5 border-b border-white/10'>
          <h1 className='text-xl font-bold tracking-tight text-white'>
            MyBuddy
          </h1>
          <p className='text-xs text-primary-200 mt-0.5'>Your AI Assistant</p>
        </div>

        {/* Nav Links */}
        <div className='flex-1 py-4 px-3 space-y-0.5'>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:bg-white/8 hover:text-white/90'
                }`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Token Balance */}
        {tokenBalance !== null && (
          <div className='px-4 py-3 border-t border-white/10'>
            <div className='flex items-center gap-2 text-xs text-white/50 mb-1.5'>
              <Coins size={14} />
              <span>{tokenBalance} tokens</span>
            </div>
            <div className='token-bar bg-white/10'>
              <div
                className='token-bar-fill !bg-white/40'
                style={{
                  width: `${Math.max(0, Math.min(100, (tokenBalance / 200) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* User Footer */}
        <div className='p-4 border-t border-white/10'>
          <div className='flex items-center justify-between'>
            <span className='text-sm text-white/70 truncate'>{user.name}</span>
            <button
              onClick={logout}
              className='text-white/40 hover:text-white/80 transition-colors p-1'
              aria-label='Log out'
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Mobile Header ─── */}
      <div className='md:hidden fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-primary-800 via-primary-700 to-primary-900'>
        <div className='flex items-center justify-between px-4 h-14'>
          <h1 className='text-lg font-bold text-white'>MyBuddy</h1>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className='text-white p-1'
            aria-label='Toggle menu'
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* ─── Mobile Overlay ─── */}
      {mobileOpen && (
        <>
          <div
            className='md:hidden fixed inset-0 bg-black/40 z-40'
            onClick={() => setMobileOpen(false)}
          />
          <div className='md:hidden fixed top-14 right-0 w-64 bottom-0 z-50 bg-gradient-to-b from-primary-800 to-primary-900 animate-fade-in p-4 space-y-1'>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button
              onClick={logout}
              className='flex items-center gap-3 px-3 py-2.5 text-white/60 hover:text-white text-sm w-full'
            >
              <LogOut size={18} />
              <span>Log Out</span>
            </button>
          </div>
        </>
      )}

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className='md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-area-pb'>
        <div className='flex justify-around py-2'>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs ${
                  isActive ? 'text-primary-600' : 'text-slate-400'
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ─── Main Content ─── */}
      <main className='flex-1 overflow-auto md:overflow-hidden pt-14 md:pt-0 pb-16 md:pb-0'>
        <Outlet />
      </main>
    </div>
  );
}
