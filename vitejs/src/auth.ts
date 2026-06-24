const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TOKEN_KEY = 'mybuddy.access_token';
const REFRESH_KEY = 'mybuddy.refresh_token';

interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

interface UserInfo {
  id: string;
  phone_email: string;
  display_name: string;
  ai_persona: {
    name: string;
    language: string;
    tone: string;
    dialect: string;
    voice_id?: string;
  };
  token_balance: number;
}

let tokens: AuthTokens | null = null;

function loadFromStorage() {
  const at = localStorage.getItem(TOKEN_KEY);
  const rt = localStorage.getItem(REFRESH_KEY);
  if (at && rt) {
    tokens = { access_token: at, refresh_token: rt };
  }
}

function save(data: AuthTokens) {
  tokens = data;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
}

function parseJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

function isExpired(token: string): boolean {
  const payload = parseJwt(token);
  const exp = (payload.exp as number) ?? 0;
  return Date.now() >= exp * 1000 - 10_000;
}

export async function register(
  phone_email: string,
  password: string,
  display_name?: string,
): Promise<UserInfo> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_email, password, display_name }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Registration failed');
  }

  const data = await res.json();
  save({ access_token: data.access_token, refresh_token: data.refresh_token });
  return data.user;
}

export async function login(
  phone_email: string,
  password: string,
): Promise<UserInfo> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Invalid credentials');
  }

  const data = await res.json();
  save({ access_token: data.access_token, refresh_token: data.refresh_token });
  return data.user;
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refresh_token) return false;

  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (!res.ok) {
      logout();
      return false;
    }

    const data = await res.json();
    save(data);
    return true;
  } catch {
    logout();
    return false;
  }
}

export async function ensureFreshToken(): Promise<boolean> {
  if (!tokens) return false;
  if (isExpired(tokens.access_token)) {
    return refreshTokens();
  }
  return true;
}

export function getToken(): string | undefined {
  return tokens?.access_token;
}

export function isAuthenticated(): boolean {
  return !!tokens?.access_token;
}

export function getUserInfo(): { name: string; email?: string } {
  if (!tokens) return { name: 'User' };
  const payload = parseJwt(tokens.access_token);
  return {
    name: (payload.name as string) ?? 'User',
    email: payload.email as string | undefined,
  };
}

export function logout() {
  tokens = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.location.href = '/login';
}

export async function initAuth(): Promise<boolean> {
  loadFromStorage();
  if (!tokens) return false;
  if (isExpired(tokens.access_token)) {
    return refreshTokens();
  }
  return true;
}
