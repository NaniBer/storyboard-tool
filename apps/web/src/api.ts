export type Scene = {
  id: string;
  title: string;
  description: string;
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

export function imageUrl(path: string): string {
  return `${baseUrl}${path.replace(/^\/api/, '')}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error: unknown }).error
      : null;
    throw new Error(typeof message === 'string' ? message : 'Something went wrong. Please try again.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const sceneApi = {
  list: () => request<Scene[]>('/scenes'),
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
