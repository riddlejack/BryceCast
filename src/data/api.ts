const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const configuredApiBase = (viteEnv.VITE_BRYCECAST_API_BASE ?? '').replace(/\/$/, '');
const browserPort = typeof window !== 'undefined' ? window.location.port : '';
const sameOriginApiPreferred = typeof window !== 'undefined' && browserPort !== '5173' && browserPort !== '4173';

export const shouldUseApi = Boolean(configuredApiBase || sameOriginApiPreferred);

export const apiUrl = (path: string) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${configuredApiBase}${normalized}`;
};

export const loadApiJson = async <T>(path: string): Promise<T | null> => {
  if (!shouldUseApi) return null;

  try {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${apiUrl(path)}${separator}t=${Date.now()}`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const postApiJson = async <T>(path: string, payload: unknown): Promise<T | null> => {
  if (!shouldUseApi) return null;

  try {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};
