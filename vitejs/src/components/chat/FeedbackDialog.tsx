import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../Toast';
import { api } from '../../api';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}

const REASONS = [
  { id: 'incorrect', label: 'Incorrect information' },
  { id: 'not_helpful', label: 'Not helpful' },
  { id: 'too_long', label: 'Too long' },
  { id: 'too_short', label: 'Too short' },
  { id: 'no_answer', label: "Didn't answer my question" },
  { id: 'poor_explanation', label: 'Poor explanation' },
  { id: 'hallucinated', label: 'Hallucinated information' },
  { id: 'offensive', label: 'Offensive or inappropriate' },
  { id: 'formatting', label: 'Formatting issues' },
  { id: 'technical_error', label: 'Technical error' },
  { id: 'other', label: 'Other' },
];

export function FeedbackDialog({
  open,
  onClose,
  conversationId,
}: FeedbackDialogProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const toast = useToast();

  if (!open) return null;

  const toggleReason = (id: string) => {
    setSelectedReasons((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (selectedReasons.length === 0) return;

    try {
      await api.submitFeedback(conversationId, {
        rating: 'bad',
        reasons: selectedReasons,
        feedbackText: feedbackText.slice(0, 1000),
      });
      setSubmitted(true);
      toast('Thank you for helping improve the AI.', 'success');
    } catch {
      toast('Failed to submit feedback.', 'error');
    }
  };

  if (submitted) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
        <div className='bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 animate-fade-in'>
          <div className='text-center'>
            <div className='text-3xl mb-3'>&#10003;</div>
            <h3 className='font-semibold text-slate-800 mb-2'>Thank you!</h3>
            <p className='text-sm text-slate-500 mb-4'>
              Thank you for helping improve the AI.
            </p>
            <button
              onClick={onClose}
              className='px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors'
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'
      onClick={onClose}
    >
      <div
        className='bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto animate-slide-up'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-4'>
          <h3 className='font-semibold text-slate-800 text-lg'>
            Help us improve
          </h3>
          <button
            onClick={onClose}
            className='p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors'
            aria-label='Close'
          >
            <X size={18} />
          </button>
        </div>

        <p className='text-sm text-slate-500 mb-3'>
          What was wrong with this response?
        </p>

        <div className='space-y-1 mb-4'>
          {REASONS.map((reason) => (
            <label
              key={reason.id}
              className='flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors'
            >
              <input
                type='checkbox'
                checked={selectedReasons.includes(reason.id)}
                onChange={() => toggleReason(reason.id)}
                className='w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-400'
              />
              <span className='text-sm text-slate-700'>{reason.label}</span>
            </label>
          ))}
        </div>

        {selectedReasons.includes('other') && (
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder='Tell us what went wrong (optional)'
            maxLength={1000}
            rows={3}
            className='w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all mb-4'
          />
        )}

        <div className='flex items-center gap-3 justify-end'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors'
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedReasons.length === 0}
            className='px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
