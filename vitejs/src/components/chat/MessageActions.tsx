import { useState, useCallback } from 'react';
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

export function MessageActions({
  content,
  conversationId,
  onRetry,
}: MessageActionsProps) {
  const [voted, setVoted] = useState<'good' | 'bad' | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const toast = useToast();

  const handleVote = useCallback(
    async (rating: 'good' | 'bad') => {
      if (voted === rating) {
        // Clicking again removes the vote
        setVoted(null);
        try {
          await api.removeFeedback(conversationId);
        } catch {
          // silent
        }
        return;
      }

      // Swapping or setting new vote
      setVoted(rating);
      try {
        await api.submitFeedback(conversationId, {
          rating,
          reasons: [],
        });
        toast('Thanks for your feedback!', 'success');
      } catch {
        setVoted(null);
        toast('Failed to submit feedback.', 'error');
      }
    },
    [voted, conversationId, toast],
  );

  const handleBad = useCallback(() => {
    if (voted === 'bad') {
      // Remove the bad vote if already voted bad
      handleVote('bad');
      return;
    }
    setFeedbackOpen(true);
  }, [voted, handleVote]);

  const handleFeedbackClose = useCallback(async () => {
    setFeedbackOpen(false);
    if (voted === 'bad') return;
    setVoted('bad');
    try {
      await api.submitFeedback(conversationId, {
        rating: 'bad',
        reasons: [],
      });
    } catch {
      setVoted(null);
    }
  }, [voted, conversationId]);

  const handleShare = useCallback(async () => {
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
  }, [content, toast]);

  return (
    <>
      <div
        className='flex items-center gap-1 mt-2 flex-wrap'
        role='group'
        aria-label='Response actions'
      >
        <CopyButton text={content} />
        <button
          onClick={() => handleVote('good')}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            voted === 'good'
              ? 'text-success bg-emerald-50'
              : 'text-slate-400 hover:text-success hover:bg-emerald-50'
          }`}
          aria-label={voted === 'good' ? 'Remove like' : 'Good response'}
          aria-pressed={voted === 'good'}
          title={voted === 'good' ? 'Remove like' : 'Good response'}
        >
          <ThumbsUp size={14} />
          <span className='hidden sm:inline'>Good</span>
        </button>
        <button
          onClick={handleBad}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            voted === 'bad'
              ? 'text-danger bg-red-50'
              : 'text-slate-400 hover:text-danger hover:bg-red-50'
          }`}
          aria-label={voted === 'bad' ? 'Remove dislike' : 'Bad response'}
          aria-pressed={voted === 'bad'}
          title={voted === 'bad' ? 'Remove dislike' : 'Bad response'}
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
