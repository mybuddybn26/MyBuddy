import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Mic, MicOff, Send, Camera, Volume2, VolumeX } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  input_type?: string;
  streaming?: boolean;
  budgets?: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; category: string; allocated_amount: number; spent_amount: number }>;
    budget_type?: string;
    period?: string;
  }>;
  showSavePrompt?: boolean;
}

function stripTransactionBlocks(text: string): string {
  return text.replace(/```transaction\s*\n[\s\S]*?\n```\n?/g, '');
}

function stripBudgetBlocks(text: string): string {
  return text.replace(/```budget\s*\n[\s\S]*?\n```\n?/g, '');
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const shouldTranscribeRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    Promise.all([
      api.chatHistory(30).catch(() => ({ data: [], count: 0 })),
      api.budgets().catch(() => ({ data: [], count: 0 })),
    ]).then(([chatRes, budgetRes]) => {
      const history = (
        chatRes.data as Array<{
          id: string;
          role: string;
          content: string;
          input_type: string;
          budgets?: Array<{ id: string; title: string; items: Array<{ id: string; category: string; allocated_amount: number; spent_amount: number }>; budget_type?: string; period?: string }>;
        }>
      ).map((m): Message => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        input_type: m.input_type,
      }));

      // Attach most recent budget to the last assistant message
      if (budgetRes.data && budgetRes.data.length > 0) {
        const lastBudget = budgetRes.data[0] as {
          id: string;
          title: string;
          lineItems: Array<{ id: string; category: string; allocated_amount: number; spent_amount: number }>;
          budgetType: string;
          period: string;
        };
        // Find last assistant message to attach budget to
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'assistant') {
            history[i] = {
              ...history[i],
              budgets: [{
                id: lastBudget.id,
                title: lastBudget.title,
                items: lastBudget.lineItems,
                budget_type: lastBudget.budgetType,
                period: lastBudget.period,
              }],
            };
            break;
          }
        }
      }

      setMessages(history);
    });
  }, []);

  const sendMessage = async (text: string, inputType = 'text') => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      input_type: inputType,
    };

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await api.chatStream(text.trim(), inputType, history);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response stream');

      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullText += data.content;
              const displayText = stripBudgetBlocks(stripTransactionBlocks(fullText));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: displayText } : m,
                ),
              );
            } else if (data.type === 'budget') {
              // Budget sheet received from AI
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        budgets: [
                          ...(m.budgets || []),
                          {
                            id: data.id,
                            title: data.title,
                            items: data.items,
                          },
                        ],
                      }
                    : m,
                ),
              );
            } else if (data.type === 'error') {
              fullText = `⚠️ ${data.content}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: fullText, streaming: false }
                    : m,
                ),
              );
            }
          } catch {
            /* skip malformed lines */
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );

      // TTS read-back
      if (ttsEnabled && fullText) {
        try {
          const ttsRes = await api.tts(fullText.slice(0, 500));
          if (ttsRes.ok) {
            const audioBlob = await ttsRes.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
          }
        } catch {
          /* TTS optional */
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: `⚠️ ${err instanceof Error ? err.message : 'Error sending message'}`,
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Tap again = cancel (stop without transcribing)
      cancelRecording();
    } else {
      startRecording();
    }
  };

  const confirmRecording = () => {
    if (!mediaRecorderRef.current) return;
    shouldTranscribeRef.current = true;
    stopRecording();
  };

  const cancelRecording = () => {
    if (!mediaRecorderRef.current) return;
    shouldTranscribeRef.current = false;
    stopRecording();
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // No AudioContext analyser — it can consume the stream before MediaRecorder
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        console.log('Chunk:', e.data.size, 'bytes');
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const shouldTranscribe = shouldTranscribeRef.current;
        shouldTranscribeRef.current = false;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (!shouldTranscribe) {
          return;
        }

        const allChunks = [...chunksRef.current];
        console.log('Total chunks:', allChunks.length, 'total bytes:', allChunks.reduce((s, c) => s + c.size, 0));

        if (allChunks.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content:
                '⚠️ No audio captured. Hold the button, speak, then release.',
            },
          ]);
          return;
        }

        const audioBlob = new Blob(allChunks, {
          type: recorder.mimeType || 'audio/webm',
        });
        console.log('Final blob:', audioBlob.size, 'type:', audioBlob.type);

        try {
          const result = await api.transcribe(audioBlob);
          console.log('Transcription:', result);
          if (result.transcript && result.transcript.trim()) {
            sendMessage(result.transcript.trim(), 'voice');
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '⚠️ No speech detected. Try again.',
              },
            ]);
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Voice transcription failed';
          console.error('Transcribe error:', msg);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `⚠️ ${msg}. Please try again or type your message.`,
            },
          ]);
        }
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      shouldTranscribeRef.current = true; // default: transcribe on stop
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setAudioLevel(0);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingDuration(elapsed);
        setAudioLevel(Math.random() * 60 + 20); // Pulsing fake level for visual feedback
      }, 200);
    } catch {
      alert(
        'Microphone access denied. Please allow microphone access to use voice input.',
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setAudioLevel(0);
  };

  // Camera / Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await api.uploadImage(file);
      sendMessage(
        `[Image uploaded: ${result.url}]\nWhat does this document say? Explain it in simple language.`,
        'image',
      );
    } catch {
      alert('Image upload failed.');
    }

    e.target.value = '';
  };

  // Audio level bar segments (10 bars)
  const levelBars = Array.from({ length: 10 }, (_, i) => {
    const threshold = (i + 1) * 10;
    const active = audioLevel >= threshold;
    return active;
  });

  return (
    <div className='flex flex-col h-full'>
      {/* ─── Messages Area ─── */}
      <div className='flex-1 overflow-y-auto p-4 space-y-3'>
        {messages.length === 0 && (
          <div className='flex flex-col items-center justify-center h-full text-center animate-fade-in'>
            <div className='text-6xl mb-4'>🤖</div>
            <h2 className='text-2xl font-bold text-primary-800 mb-2'>
              Welcome to MyBuddy!
            </h2>
            <p className='text-slate-500 max-w-md text-sm leading-relaxed'>
              Your AI assistant is ready to help. Try saying:
              <br />
              <span className='text-primary-600 font-medium'>
                "Make me a $100 weekly food budget"
              </span>
              <br />
              <span className='text-primary-600 font-medium'>
                "I sold 5 boxes of kuih for $8 each"
              </span>
              <br />
              Or tap 📷 to scan a document!
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={
                msg.role === 'user'
                  ? 'chat-bubble-user'
                  : 'chat-bubble-assistant'
              }
            >
              <div className='whitespace-pre-wrap text-sm leading-relaxed'>
                {msg.content}
                {msg.streaming && (
                  <span className='inline-block w-1.5 h-4 bg-primary-400 ml-0.5 animate-pulse rounded-sm' />
                )}
              </div>
              {/* Budget Sheets */}
              {msg.budgets && msg.budgets.length > 0 && (
                <div className='mt-3 space-y-3'>
                  {msg.budgets.map((budget) => (
                    <div key={budget.id} className='bg-white rounded-lg border border-emerald-200 overflow-hidden'>
                      <div className='bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center justify-between'>
                        <span className='text-xs font-semibold text-emerald-700'>
                          📊 {budget.title}
                        </span>
                        <span className='text-xs text-emerald-500'>
                          {budget.period === 'weekly' ? 'Weekly' : budget.period === 'monthly' ? 'Monthly' : 'One-time'}
                        </span>
                      </div>
                      <table className='w-full text-xs'>
                        <thead>
                          <tr className='border-b border-slate-100'>
                            <th className='text-left px-3 py-1.5 text-slate-500 font-medium'>Category</th>
                            <th className='text-right px-3 py-1.5 text-slate-500 font-medium'>Allocated</th>
                            <th className='text-right px-3 py-1.5 text-slate-500 font-medium'>Spent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budget.items.map((item) => (
                            <tr key={item.id} className='border-b border-slate-50 last:border-0'>
                              <td className='px-3 py-1.5 text-slate-700 font-medium'>{item.category}</td>
                              <td className='px-3 py-1.5 text-right text-emerald-600 font-mono'>${item.allocated_amount.toFixed(2)}</td>
                              <td className='px-3 py-1.5 text-right text-slate-400 font-mono'>
                                {item.spent_amount > 0 ? `$${item.spent_amount.toFixed(2)}` : '-'}
                              </td>
                            </tr>
                          ))}
                          <tr className='bg-slate-50'>
                            <td className='px-3 py-1.5 font-bold text-slate-700'>Total</td>
                            <td className='px-3 py-1.5 text-right font-bold font-mono text-emerald-700'>
                              ${budget.items.reduce((sum, item) => sum + item.allocated_amount, 0).toFixed(2)}
                            </td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Recording Indicator Bar ─── */}
      {isRecording && (
        <div className='bg-red-50 border-t border-red-200 px-4 py-2 flex items-center gap-3'>
          {/* Audio level bars */}
          <div className='flex items-center gap-0.5 flex-1'>
            {levelBars.map((active, i) => (
              <div
                key={i}
                className='flex-1 rounded-sm transition-all duration-75'
                style={{
                  height: `${8 + (i + 1) * 2}px`,
                  backgroundColor: active ? '#ef4444' : '#fca5a5',
                  opacity: active ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          {/* Recording timer */}
          <span className='text-red-600 font-mono text-sm font-medium tabular-nums min-w-[3ch]'>
            {formatDuration(recordingDuration)}
          </span>
          {/* Pulsing dot */}
          <div className='w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse' />
          {/* Cancel */}
          <button
            onClick={cancelRecording}
            className='w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors'
            aria-label='Cancel recording'
          >
            ✕
          </button>
          {/* Confirm */}
          <button
            onClick={confirmRecording}
            className='w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors'
            aria-label='Confirm and send'
          >
            ✓
          </button>
        </div>
      )}

      {/* ─── Input Bar ─── */}
      <div className='border-t border-slate-200 bg-white px-4 py-3'>
        <form onSubmit={handleSubmit} className='flex items-center gap-2'>
          {/* Camera */}
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            className='p-2.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors'
            aria-label='Upload photo'
          >
            <Camera size={20} />
          </button>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            capture='environment'
            className='hidden'
            onChange={handleImageUpload}
          />

          {/* Text Input */}
          <input
            type='text'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Type a message…'
            disabled={isStreaming}
            className='flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all disabled:opacity-50'
          />

          {/* TTS Toggle */}
          <button
            type='button'
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`p-2.5 rounded-xl transition-colors ${
              ttsEnabled
                ? 'text-primary-500 bg-primary-50'
                : 'text-slate-400 hover:text-primary-500 hover:bg-primary-50'
            }`}
            aria-label={
              ttsEnabled ? 'Disable voice read-back' : 'Enable voice read-back'
            }
          >
            {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {/* Voice / Send */}
          {input.trim() ? (
            <button
              type='submit'
              disabled={isStreaming}
              className='p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50'
              aria-label='Send message'
            >
              <Send size={20} />
            </button>
          ) : (
            <button
              type='button'
              onClick={toggleRecording}
              className={`p-2.5 rounded-xl transition-all ${
                isRecording
                  ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-200 animate-pulse'
                  : 'bg-primary-500 text-white hover:bg-primary-600'
              }`}
              aria-label={isRecording ? 'Tap to cancel' : 'Tap to speak'}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
