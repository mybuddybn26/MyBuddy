import { useState } from 'react';
import { ThumbsUp, ThumbsDown, RotateCcw, Share2 } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { SpeechControls } from './SpeechControls';
import { FeedbackDialog } from './FeedbackDialog';
import { useToast } from '../Toast';
import { api } from '../../api';

interface MessageActionsProps {
  content: string;
  conversationId: string;
  onRetry: () => void;
}

export function MessageActions({ content, conversationId, onRetry }: MessageActionsProps) {
  const [voted, setVoted] = useState<'good' | 'bad' | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const toast = useToast();

  const handleGood = async () => {
    if (voted) return;
    setVoted('good');
    try {
      await api.submitFeedback(conversationId, {
        rating: 'good',
        reasons: [],
      });
      toast('Thanks for your feedback!', 'success');
    } catch {
      toast('Failed to submit feedback.', 'error');
    }
  };

  const handleBad = () => {
    if (voted) return;
    setFeedbackOpen(true);
  };

  const handleShare = async () => {
    const shareData = { text: content };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(content);
        toast('Response copied for sharing.', 'success');
      } catch {
        toast('Sharing is not supported on this device.', 'error');
      }
    }
  };

  const handleFeedbackClose = async () => {
    setFeedbackOpen(false);
    setVoted('bad');
    try {
      await api.submitFeedback(conversationId, {
        rating: 'bad',
        reasons: [],
      });
    } catch {
      // silent
    }
  };

  return (
    <>
      <div
        className='flex items-center gap-1 mt-2 flex-wrap'
        role='group'
        aria-label='Response actions'
      >
        <CopyButton text={content} />
        <button
          onClick={handleGood}
          disabled={voted !== null}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            voted === 'good'
              ? 'text-success bg-emerald-50'
              : 'text-slate-400 hover:text-success hover:bg-emerald-50'
          } disabled:cursor-not-allowed`}
          aria-label='Good response'
          title='Good response'
        >
          <ThumbsUp size={14} />
          <span className='hidden sm:inline'>Good</span>
        </button>
        <button
          onClick={handleBad}
          disabled={voted !== null}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            voted === 'bad'
              ? 'text-danger bg-red-50'
              : 'text-slate-400 hover:text-danger hover:bg-red-50'
          } disabled:cursor-not-allowed`}
          aria-label='Bad response'
          title='Bad response'
        >
          <ThumbsDown size={14} />
          <span className='hidden sm:inline'>Bad</span>
        </button>
        <button
          onClick={onRetry}
          className='flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors'
          aria-label='Try again'
          title='Try again'
        >
          <RotateCcw size={14} />
          <span className='hidden sm:inline'>Retry</span>
        </button>
        <SpeechControls text={content} />
        <button
          onClick={handleShare}
          className='flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors'
          aria-label='Share response'
          title='Share response'
        >
          <Share2 size={14} />
          <span className='hidden sm:inline'>Share</span>
        </button>
      </div>
      <FeedbackDialog
        open={feedbackOpen}
        onClose={handleFeedbackClose}
        conversationId={conversationId}
      />
    </>
  );
}
