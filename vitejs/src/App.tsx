import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { initAuth } from './auth';
import { Layout } from './components/Layout';

const Chat = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Ledger = lazy(() => import('./pages/Ledger').then(m => ({ default: m.Ledger })));
const Documents = lazy(() => import('./pages/Documents').then(m => ({ default: m.Documents })));
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })));
const Budgets = lazy(() => import('./pages/Budgets').then(m => ({ default: m.Budgets })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

function PageLoader() {
  return (
    <div className='flex items-center justify-center min-h-[60vh]'>
      <div className='flex flex-col items-center gap-3'>
        <div className='w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin' />
        <span className='text-primary-500 text-xs animate-pulse'>Loading...</span>
      </div>
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    initAuth().then((ok) => {
      setAuthed(ok);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-surface'>
        <div className='flex flex-col items-center gap-3'>
          <div className='w-10 h-10 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin' />
          <span className='text-primary-600 font-medium text-sm'>Loading MyBuddy…</span>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path='/login' element={<Login onAuth={() => setAuthed(true)} />} />
            <Route path='*' element={<Navigate to='/login' replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Chat />} />
            <Route path='ledger' element={<Ledger />} />
            <Route path='documents' element={<Documents />} />
            <Route path='billing' element={<Billing />} />
            <Route path='budgets' element={<Budgets />} />
            <Route path='settings' element={<Settings />} />
          </Route>
          <Route path='/login' element={<Navigate to='/' replace />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
