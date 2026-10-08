export type Scene = {
  id: string;
  title: string;
  description: string;
  position: number;
  shotCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Shot = {
  id: string;
  sceneId: string;
  shotType: string;
  description: string;
  notes: string;
  prompt: string;
  status: 'draft' | 'approved';
  position: number;
  createdAt: string;
  updatedAt: string;
  image: ShotImage | null;
};

export type ShotImage = {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error: string | null;
  previewUrl: string | null;
  previousPreviewUrl: string | null;
};

export type ShotChanges = Partial<Pick<Shot, 'shotType' | 'description' | 'notes' | 'status'>>;
export type ExportFormat = 'pdf' | 'txt' | 'json';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
let csrfToken: string | null = null;
let signedOut = false;

export type AuthSession = { username: string; csrfToken: string };
export type AuthOptions = { temporaryLogin: { username: string; password: string } | null };

export function imageUrl(path: string): string {
  return `${baseUrl}${path.replace(/^\/api/, '')}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
      credentials: 'include',
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET', 'HEAD', 'OPTIONS'].includes(init?.method ?? 'GET') && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && !signedOut) {
      csrfToken = null;
      window.dispatchEvent(new Event('storyboard:session-expired'));
    }
    const payload: unknown = await response.json().catch(() => null);
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error: unknown }).error
      : null;
    throw new Error(typeof message === 'string' ? message : response.status >= 500
      ? 'The server is unavailable. Check that the API is running and try again.'
      : 'Something went wrong. Please try again.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const authApi = {
  forgetSession(): void {
    signedOut = true;
    csrfToken = null;
  },
  options: () => request<AuthOptions>('/auth/options'),
  async me(): Promise<AuthSession> {
    const session = await request<AuthSession>('/auth/me');
    csrfToken = session.csrfToken;
    signedOut = false;
    return session;
  },
  async login(username: string, password: string): Promise<AuthSession> {
    const session = await request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    csrfToken = session.csrfToken;
    signedOut = false;
    return session;
  },
  async logout(): Promise<void> {
    signedOut = true;
    try {
      await request<void>('/auth/logout', { method: 'POST' });
      csrfToken = null;
    } catch (error) {
      signedOut = false;
      throw error;
    }
  },
};

export const sceneApi = {
  list: () => request<Scene[]>('/scenes'),
  reorder: (ids: string[]) => request<Scene[]>('/scenes/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  }),
  get: (id: string) => request<Scene>(`/scenes/${encodeURIComponent(id)}`),
  create: (title: string, description: string) =>
    request<Scene>('/scenes', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }),
  update: (id: string, title: string, description: string) =>
    request<Scene>(`/scenes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, description }),
    }),
  exportUrl: (id: string, format: ExportFormat) => `${baseUrl}/scenes/${encodeURIComponent(id)}/export/${format}`,
};

export const shotApi = {
  list: (sceneId: string) => request<Shot[]>(`/scenes/${encodeURIComponent(sceneId)}/shots`),
  create: (sceneId: string) => request<Shot>(`/scenes/${encodeURIComponent(sceneId)}/shots`, {
    method: 'POST',
    body: JSON.stringify({ shotType: 'Wide shot' }),
  }),
  update: (id: string, changes: ShotChanges) => request<Shot>(`/shots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  reorder: (sceneId: string, ids: string[]) => request<Shot[]>(`/scenes/${encodeURIComponent(sceneId)}/shots/order`, {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  }),
  remove: (id: string) => request<void>(`/shots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Shot>(`/shots/${encodeURIComponent(id)}/image`, { method: 'POST', body: form });
  },
  retryImage: (id: string) => request<Shot>(`/shots/${encodeURIComponent(id)}/image/retry`, { method: 'POST' }),
  generatePrompt: (id: string) => request<Shot>(`/shots/${encodeURIComponent(id)}/generate-prompt`, { method: 'POST' }),
};
