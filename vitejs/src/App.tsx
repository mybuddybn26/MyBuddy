import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { initAuth } from './auth';
import { Layout } from './components/Layout';
import { Chat } from './pages/Chat';
import { Login } from './pages/Login';
import { Ledger } from './pages/Ledger';
import { Documents } from './pages/Documents';
import { Billing } from './pages/Billing';
import { Budgets } from './pages/Budgets';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';

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
          <span className='text-primary-600 font-medium text-sm'>
            Loading MyBuddy…
          </span>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path='/login'
            element={<Login onAuth={() => setAuthed(true)} />}
          />
          <Route path='*' element={<Navigate to='/login' replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
