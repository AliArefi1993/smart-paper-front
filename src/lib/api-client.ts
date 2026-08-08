const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010/api";

export function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8010/api`;
  }
  return DEFAULT_API_BASE_URL;
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, init);
  if (!response.ok) {
    throw response;
  }
  return (await response.json()) as T;
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${resolveApiBaseUrl()}${path}`, init);
}
