import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Mic, MicOff, Send, Camera, PhoneCall, AudioLines } from 'lucide-react';
import { MessageActions } from '../components/chat/MessageActions';
import { VoiceCallPanel } from '../components/chat/VoiceCallPanel';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  input_type?: string;
  streaming?: boolean;
  voice?: boolean;
  conversationId?: string;
  toolConfirm?: { confirmationId: string; tool: string; params: Record<string, unknown>; label: string };
  budgets?: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; category: string; allocated_amount: number; spent_amount: number }>;
    budget_type?: string;
    period?: string;
  }>;
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
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const olderOffsetRef = useRef(0);
  const loadingOlderRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const shouldTranscribeRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceBubbleRef = useRef<{ userId?: string; assistantId?: string }>({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    api.chatHistory(30).catch(() => ({ data: [], count: 0 })).then((chatRes) => {
      olderOffsetRef.current = (chatRes.data as Array<Record<string, unknown>>).length;
      setHasMoreHistory(olderOffsetRef.current >= 30);
      const history = (
        chatRes.data as Array<{ id: string; role: string; content: string; input_type: string }>
      ).map((m): Message => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, input_type: m.input_type }));
      setMessages(history);
    });
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreHistory) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight || 0;
      const prevScrollTop = container?.scrollTop || 0;

      const res = await api.chatHistory(30, olderOffsetRef.current);
      const data = res.data as Array<{ id: string; role: string; content: string; input_type: string }>;

      if (data.length === 0) { setHasMoreHistory(false); return; }

      olderOffsetRef.current += data.length;
      setHasMoreHistory(data.length >= 30);

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = data
          .filter((m) => !existingIds.has(m.id))
          .map((m): Message => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, input_type: m.input_type }));
        if (newMsgs.length === 0) return prev;
        requestAnimationFrame(() => {
          if (container) { container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop; }
        });
        return [...newMsgs, ...prev];
      });
    } catch { /* ignore */ }
    finally { loadingOlderRef.current = false; setLoadingOlder(false); }
  }, [hasMoreHistory]);

  const sendMessage = useCallback(async (text: string, inputType = 'text') => {
    if (!text.trim() || isStreaming) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim(), input_type: inputType };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const response = await api.chatStream(text.trim(), inputType, history);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
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
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: displayText } : m));
            } else if (data.type === 'budget') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, budgets: [...(m.budgets || []), { id: data.id, title: data.title, items: data.items }] } : m));
            } else if (data.type === 'tool_confirm') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false, toolConfirm: { confirmationId: data.confirmationId, tool: data.tool, params: data.params, label: data.label } } : m));
            } else if (data.type === 'tool_result') {
              fullText += `\n✅ ${data.tool.replace('create', '').replace(/([A-Z])/g, ' $1').trim()} completed.`;
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: stripBudgetBlocks(stripTransactionBlocks(fullText)), toolConfirm: undefined } : m));
            } else if (data.type === 'error') {
              fullText = `⚠️ ${data.content}`;
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: fullText, streaming: false } : m));
            } else if (data.type === 'done') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, conversationId: data.conversationId } : m));
            }
          } catch { /* skip */ }
        }
      }
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m));
      setIsStreaming(false);
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `⚠️ ${err instanceof Error ? err.message : 'Error sending message'}`, streaming: false } : m));
      setIsStreaming(false);
    }
  }, [messages, isStreaming]);

  const onVoiceBubble = useCallback((phase: string, role: 'user' | 'assistant', content: string) => {
    const b = voiceBubbleRef.current;
    if (phase === 'transcribing' && role === 'user') {
      const id = crypto.randomUUID();
      b.userId = id;
      setMessages((prev) => [...prev, { id, role: 'user', content: 'Transcribing...', streaming: true }]);
    } else if (phase === 'accepted' && b.userId) {
      setMessages((prev) => prev.map((m) => m.id === b.userId ? { ...m, content, streaming: false, input_type: 'voice', voice: true } : m));
      b.userId = undefined;
    } else if (phase === 'ignored' && b.userId) {
      setMessages((prev) => prev.filter((m) => m.id !== b.userId));
      b.userId = undefined;
    } else if (phase === 'thinking' && role === 'assistant') {
      const id = crypto.randomUUID();
      b.assistantId = id;
      setMessages((prev) => [...prev, { id, role: 'assistant', content: 'Buddy is thinking...', streaming: true }]);
    } else if (phase === 'responding' && b.assistantId) {
      setMessages((prev) => prev.map((m) => m.id === b.assistantId ? { ...m, content, streaming: false } : m));
      b.assistantId = undefined;
    } else if (phase === 'cleanup') {
      if (b.userId) { setMessages((prev) => prev.filter((m) => m.id !== b.userId)); b.userId = undefined; }
      if (b.assistantId) { setMessages((prev) => prev.filter((m) => m.id !== b.assistantId)); b.assistantId = undefined; }
    }
  }, []);

  const onVoiceReveal = useCallback((text: string) => {
    const b = voiceBubbleRef.current;
    if (b.assistantId) {
      setMessages((prev) => prev.map((m) => m.id === b.assistantId ? { ...m, content: text } : m));
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const handleToolConfirm = useCallback(async (msgId: string, confirmationId: string) => {
    try {
      const result = await api.toolConfirm(confirmationId);
      if (result.ok) {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content + `\n✅ Completed.`, toolConfirm: undefined } : m));
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, toolConfirm: undefined } : m));
    }
  }, []);

  const handleToolCancel = useCallback(async (msgId: string, confirmationId: string) => {
    try {
      await api.toolCancel(confirmationId);
    } catch {}
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content + '\n_Action cancelled._', toolConfirm: undefined } : m));
  }, []);

  const handleRetry = (assistantMsgId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantMsgId);
      if (idx <= 0) return prev;
      const userMsg = prev[idx - 1];
      if (userMsg.role !== 'user') return prev;
      const newMessages = [...prev];
      newMessages.splice(idx - 1, 2);
      setMessages(newMessages);
      setTimeout(() => sendMessage(userMsg.content, userMsg.input_type), 0);
      return newMessages;
    });
  };

  const cleanupRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; analyserRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setAudioLevel(0);
    setRecordingDuration(0);
  }, []);

  const submitAudio = useCallback(async (blob: Blob) => {
    try {
      const result = await api.transcribe(blob);
      if (result.transcript?.trim()) setInput(result.transcript.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voice transcription failed';
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${msg}. Please try again or type your message.` }]);
    }
  }, []);

  const startAutoRecord = useCallback(async () => {
    if (isRecording || isStreaming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        cleanupRecording();
        const allChunks = [...chunksRef.current];
        if (allChunks.length === 0) return;
        const audioBlob = new Blob(allChunks, { type: 'audio/webm' });
        if (audioBlob.size < 500) return;
        await submitAudio(audioBlob);
      };
      recorder.onerror = () => { cleanupRecording(); };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      shouldTranscribeRef.current = true;
      recordingStartRef.current = Date.now();
      setIsRecording(true); setAudioLevel(0); setRecordingDuration(0);
      timerRef.current = setInterval(() => { setRecordingDuration(Math.floor((Date.now() - recordingStartRef.current) / 1000)); }, 200);
      const checkSilence = () => {
        if (!analyserRef.current || !shouldTranscribeRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const level = Math.min(100, Math.max(0, avg));
        setAudioLevel(level);
        if (level > 10) { if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; } }
        else if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') { shouldTranscribeRef.current = false; mediaRecorderRef.current.stop(); }
          }, 1500);
        }
        rafRef.current = requestAnimationFrame(checkSilence);
      };
      rafRef.current = requestAnimationFrame(checkSilence);
    } catch { alert('Microphone access denied. Please allow microphone access to use voice input.'); }
  }, [isRecording, isStreaming, cleanupRecording, submitAudio]);

  const toggleRecording = useCallback(() => {
    if (isRecording) { if (mediaRecorderRef.current?.state === 'recording') { shouldTranscribeRef.current = false; mediaRecorderRef.current.stop(); } }
    else startAutoRecord();
  }, [isRecording, startAutoRecord]);

  const confirmRecording = useCallback(() => { if (mediaRecorderRef.current?.state === 'recording') { shouldTranscribeRef.current = true; mediaRecorderRef.current.stop(); } }, []);
  const cancelRecording = useCallback(() => { if (mediaRecorderRef.current?.state === 'recording') { shouldTranscribeRef.current = false; mediaRecorderRef.current.stop(); } }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { const result = await api.uploadImage(file); sendMessage(`[Image uploaded: ${result.url}]\nWhat does this document say? Explain it in simple language.`, 'image'); }
    catch { alert('Image upload failed.'); }
    e.target.value = '';
  };

  const levelBars = Array.from({ length: 10 }, (_, i) => ({ active: audioLevel >= (i + 1) * 10 }));

  return (
    <div className='flex flex-col h-full'>
      <div
        ref={messagesContainerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop < 80 && hasMoreHistory && !loadingOlderRef.current) {
            loadOlderMessages();
          }
        }}
        className='flex-1 overflow-y-auto p-4 space-y-3'
      >
        {loadingOlder && (
          <div className='flex justify-center py-3'>
            <span className='text-xs text-slate-400 animate-pulse'>Loading older messages...</span>
          </div>
        )}
        {!hasMoreHistory && messages.length > 0 && (
          <div className='flex justify-center py-3'>
            <span className='text-xs text-slate-300'>Beginning of conversation</span>
          </div>
        )}
        {messages.length === 0 && (
          <div className='flex flex-col items-center justify-center h-full text-center animate-fade-in'>
            <div className='text-6xl mb-4'>🤖</div>
            <h2 className='text-2xl font-bold text-primary-800 mb-2'>Welcome to MyBuddy!</h2>
            <p className='text-slate-500 max-w-md text-sm leading-relaxed'>
              Your AI assistant is ready to help. Try saying:<br />
              <span className='text-primary-600 font-medium'>"Make me a $100 weekly food budget"</span><br />
              <span className='text-primary-600 font-medium'>"I sold 5 boxes of kuih for $8 each"</span><br />
              Or tap 📷 to scan a document!
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={msg.voice ? (msg.role === 'user' ? 'chat-bubble-user-voice' : 'chat-bubble-assistant-voice') : (msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant')}>
              <div className='whitespace-pre-wrap text-sm leading-relaxed'>
                {msg.content}
                {msg.streaming && <span className='inline-block w-1.5 h-4 bg-primary-400 ml-0.5 animate-pulse rounded-sm' />}
              </div>
              {msg.voice && (
                <div className='voice-indicator'>
                  <AudioLines size={10} />
                  <span>Voice</span>
                </div>
              )}
              {msg.budgets && msg.budgets.length > 0 && msg.budgets.some((b) => b.items && b.items.length > 0) && (
                <div className='mt-3 space-y-3'>
                  {msg.budgets.map((budget) => (
                    <div key={budget.id} className='bg-white rounded-lg border border-emerald-200 overflow-hidden'>
                      <div className='bg-emerald-50 px-3 py-2 border-b border-emerald-200 flex items-center justify-between'>
                        <span className='text-xs font-semibold text-emerald-700'>📊 {budget.title}</span>
                        <span className='text-xs text-emerald-500'>{budget.period === 'weekly' ? 'Weekly' : budget.period === 'monthly' ? 'Monthly' : 'One-time'}</span>
                      </div>
                      <table className='w-full text-xs'><thead><tr className='border-b border-slate-100'><th className='text-left px-3 py-1.5 text-slate-500 font-medium'>Category</th><th className='text-right px-3 py-1.5 text-slate-500 font-medium'>Allocated</th><th className='text-right px-3 py-1.5 text-slate-500 font-medium'>Spent</th></tr></thead>
                        <tbody>{budget.items.map((item) => (<tr key={item.id} className='border-b border-slate-50 last:border-0'><td className='px-3 py-1.5 text-slate-700 font-medium'>{item.category}</td><td className='px-3 py-1.5 text-right text-emerald-600 font-mono'>${item.allocated_amount.toFixed(2)}</td><td className='px-3 py-1.5 text-right text-slate-400 font-mono'>{item.spent_amount > 0 ? `$${item.spent_amount.toFixed(2)}` : '-'}</td></tr>))}
                          <tr className='bg-slate-50'><td className='px-3 py-1.5 font-bold text-slate-700'>Total</td><td className='px-3 py-1.5 text-right font-bold font-mono text-emerald-700'>${budget.items.reduce((sum, item) => sum + item.allocated_amount, 0).toFixed(2)}</td><td /></tr></tbody></table>
                    </div>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && !msg.streaming && msg.toolConfirm && (
                <div className='mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl'>
                  <div className='flex items-center justify-between mb-2'>
                    <span className='text-xs font-semibold text-amber-700'>{msg.toolConfirm.label}</span>
                  </div>
                  <div className='flex gap-2'>
                    <button onClick={() => handleToolConfirm(msg.id, msg.toolConfirm!.confirmationId)} className='flex-1 py-1.5 bg-primary-500 text-white rounded-lg text-xs font-medium hover:bg-primary-600 transition-colors'>Confirm</button>
                    <button onClick={() => handleToolCancel(msg.id, msg.toolConfirm!.confirmationId)} className='flex-1 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors'>Cancel</button>
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && !msg.streaming && msg.content && !msg.toolConfirm && (
                <MessageActions content={msg.content} conversationId={msg.conversationId || msg.id} onRetry={() => handleRetry(msg.id)} />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isRecording && (
        <div className='bg-red-50/80 border-t border-red-200 px-4 py-2 flex items-center gap-3'>
          <div className='flex items-center gap-0.5 flex-1'>{levelBars.map((bar, i) => (<div key={i} className='flex-1 rounded-sm transition-all duration-75' style={{ height: `${8 + (i + 1) * 2}px`, backgroundColor: bar.active ? 'var(--color-danger)' : 'rgba(239,68,68,0.3)', opacity: bar.active ? 1 : 0.6 }} />))}</div>
          <span className='text-red-600 font-mono text-sm font-medium tabular-nums min-w-[3ch]'>{formatDuration(recordingDuration)}</span>
          <div className='w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse' />
          <button onClick={cancelRecording} className='w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors' aria-label='Cancel recording'>✕</button>
          <button onClick={confirmRecording} className='w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors' aria-label='Confirm and send'>✓</button>
        </div>
      )}

      <div className='border-t border-slate-100 bg-white px-4 py-3'>
        <form onSubmit={handleSubmit} className='flex items-center gap-2 max-w-2xl mx-auto'>
          <button type='button' onClick={() => fileInputRef.current?.click()} className='p-2.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors' aria-label='Upload photo'><Camera size={20} /></button>
          <input ref={fileInputRef} type='file' accept='image/*' capture='environment' className='hidden' onChange={handleImageUpload} />
           <input type='text' value={input} onChange={(e) => setInput(e.target.value)} placeholder={isRecording ? 'Listening...' : 'Type a message…'} disabled={isStreaming || isRecording} className='flex-1 px-4 py-2.5 bg-surface border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all disabled:opacity-50' />
          {input.trim() ? (
            <button type='submit' disabled={isStreaming} className='p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50' aria-label='Send message'><Send size={20} /></button>
          ) : (
            <button type='button' onClick={toggleRecording} className={`p-2.5 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-200 animate-pulse' : 'bg-primary-500 text-white hover:bg-primary-600'}`} aria-label={isRecording ? 'Stop recording' : 'Start recording'}>{isRecording ? <MicOff size={20} /> : <Mic size={20} />}</button>
          )}
          <button type='button' onClick={() => setVoiceCallOpen(true)} className='p-2.5 text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors' aria-label='Start voice call'><PhoneCall size={20} /></button>
        </form>
      </div>

      <VoiceCallPanel open={voiceCallOpen} onClose={() => setVoiceCallOpen(false)} onBubble={onVoiceBubble} onRevealText={onVoiceReveal} />
    </div>
  );
}
