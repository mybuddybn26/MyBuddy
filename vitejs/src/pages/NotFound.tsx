import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-surface p-4 text-center'>
      <div className='text-6xl mb-4'>🤖</div>
      <h1 className='text-2xl font-bold text-slate-800 mb-2'>Page Not Found</h1>
      <p className='text-slate-500 mb-6 text-sm'>
        MyBuddy couldn't find what you're looking for.
      </p>
      <Link
        to='/'
        className='px-6 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors'
      >
        Go to Chat
      </Link>
    </div>
  );
}
