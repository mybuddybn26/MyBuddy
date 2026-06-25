import { ensureFreshToken, getToken, logout } from './auth';

const BASE = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureFreshToken();
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'No tokens remaining');
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

async function uploadFile(
  path: string,
  file: File | Blob,
  filename?: string,
): Promise<{ url: string }> {
  await ensureFreshToken();
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file, filename || 'upload');

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Upload failed');
  }
  return res.json();
}

export const api = {
  // Auth
  me: () => request<Record<string, unknown>>('/api/auth/me'),

  // Chat (returns ReadableStream for SSE)
  async chatStream(
    message: string,
    inputType = 'text',
    history: Array<{ role: string; content: string }> = [],
  ) {
    await ensureFreshToken();
    const token = getToken();
    return fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        input_type: inputType,
        conversation_history: history,
      }),
    });
  },

  chatHistory: (limit = 50, offset = 0) =>
    request<{ data: Array<Record<string, unknown>>; count: number }>(
      `/api/chat/history?limit=${limit}&offset=${offset}`,
    ),

  budgets: () =>
    request<{ data: Array<Record<string, unknown>>; count: number }>(
      '/api/budgets',
    ),

  createBudget: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBudget: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/budgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteBudget: (id: string) =>
    request<void>(`/api/budgets/${id}`, { method: 'DELETE' }),

  aiEditBudget: (id: string, message: string) =>
    request<Record<string, unknown>>(`/api/budgets/${id}/ai-edit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Voice
  transcribe: (audioBlob: Blob) =>
    uploadFile('/api/voice/transcribe', audioBlob, 'audio.webm') as Promise<
      { transcript: string } & { url: string }
    >,

  tts: async (text: string, voiceId?: string) => {
    await ensureFreshToken();
    const token = getToken();
    return fetch(`${BASE}/api/voice/tts/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        ...(voiceId ? { voice_id: voiceId } : {}),
      }),
    });
  },

  ttsVoices: () =>
    request<{ voices: Array<{ id: string; label: string }>; default: string }>(
      '/api/voice/tts/voices',
    ),

  // Upload
  uploadImage: (file: File) => uploadFile('/api/upload/image', file, file.name),

  // Transactions
  createTransaction: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  transactions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ data: Array<Record<string, unknown>>; count: number }>(
      `/api/transactions${qs ? `?${qs}` : ''}`,
    );
  },

  transactionSummary: (period: 'day' | 'week' = 'day') =>
    request<Record<string, unknown>>(
      `/api/transactions/summary?period=${period}`,
    ),

  updateTransaction: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: string) =>
    request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),

  // Documents
  createDocument: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  documents: (limit = 20, offset = 0) =>
    request<{ data: Array<Record<string, unknown>>; count: number }>(
      `/api/documents?limit=${limit}&offset=${offset}`,
    ),

  analyzeDocument: (id: string) =>
    request<{ summary: string; doc_type: string }>(
      `/api/documents/${id}/analyze`,
      {
        method: 'POST',
      },
    ),

  updateDocument: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: 'DELETE' }),

  // PDF
  async generatePdf(
    title: string,
    sections: Array<{ heading: string; body: string }>,
  ) {
    await ensureFreshToken();
    const token = getToken();
    const res = await fetch(`${BASE}/api/pdf/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title, content: { sections } }),
    });
    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ detail: 'PDF generation failed' }));
      throw new Error(body.detail || 'PDF generation failed');
    }
    return res.blob();
  },

  async generateReport(documentId: string) {
    await ensureFreshToken();
    const token = getToken();
    const res = await fetch(`${BASE}/api/pdf/generate-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ document_id: documentId }),
    });
    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ detail: 'Report generation failed' }));
      throw new Error(body.detail || 'Report generation failed');
    }
    return res.blob();
  },

  // Persona
  getPersona: () => request<Record<string, unknown>>('/api/persona'),
  updatePersona: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/persona', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Tokens
  tokenBalance: () => request<Record<string, unknown>>('/api/tokens/balance'),

  // Billing
  billingPlans: () => request<Record<string, unknown>>('/api/billing/plans'),
  createCheckout: (packId: string) =>
    request<Record<string, unknown>>('/api/billing/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ pack_id: packId }),
    }),

  confirmPayment: (reference: string) =>
    request<Record<string, unknown>>('/api/billing/confirm', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }),

  // Feedback
  submitFeedback: (
    conversationId: string,
    data: { rating: 'good' | 'bad'; reasons: string[]; feedbackText?: string },
  ) =>
    request<{ status: string }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ conversationId, ...data }),
    }),

  removeFeedback: (conversationId: string) =>
    request<{ status: string }>('/api/feedback', {
      method: 'DELETE',
      body: JSON.stringify({ conversationId }),
    }),

  usageMe: () =>
    request<{
      summary: { totalRequests: number; totalTokens: number };
      byFeature: Array<{ feature: string; tokens: number }>;
    }>('/api/usage/me'),

  usageHistory: (limit = 50, offset = 0) =>
    request<{ data: Array<Record<string, unknown>>; count: number }>(
      `/api/usage/me/history?limit=${limit}&offset=${offset}`,
    ),

  memories: () =>
    request<{
      data: Array<{
        id: string;
        type: string;
        content: string;
        importance: number;
        createdAt: string;
        updatedAt: string;
      }>;
      count: number;
    }>('/api/memories'),

  createMemory: (data: {
    type: string;
    content: string;
    importance?: number;
  }) =>
    request<Record<string, unknown>>('/api/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMemory: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/memories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  toolConfirm: (confirmationId: string) =>
    request<{ ok: boolean; tool: string; data?: unknown }>(
      '/api/tools/confirm',
      { method: 'POST', body: JSON.stringify({ confirmationId }) },
    ),

  toolCancel: (confirmationId: string) =>
    request<{ ok: boolean }>('/api/tools/cancel', {
      method: 'POST',
      body: JSON.stringify({ confirmationId }),
    }),

  deleteMemory: (id: string) =>
    request<void>(`/api/memories/${id}`, { method: 'DELETE' }),
};
