import { useState, useCallback } from 'react';
import { Copy, CircleCheck } from 'lucide-react';
import { useToast } from '../Toast';

interface CopyButtonProps {
  text: string;
  label?: string;
}

export function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast('Response copied.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      toast('Response copied.', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text, toast]);

  return (
    <button
      onClick={handleCopy}
      className='flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors'
      aria-label={`Copy response${copied ? ' (copied)' : ''}`}
      title='Copy response'
    >
      {copied ? <CircleCheck size={14} /> : <Copy size={14} />}
      <span className='hidden sm:inline'>{label}</span>
    </button>
  );
}
