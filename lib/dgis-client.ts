/**
 * Server-only 2GIS API helpers. Never import from client components.
 * Prefer DGIS_API_KEY; also read DGIS_KEY if that name is already set in Vercel.
 * Never log the key value.
 */

const KEY_ENV_NAMES = ['DGIS_API_KEY', 'DGIS_KEY'] as const;

export function getDgisApiKey(): string | undefined {
  for (const name of KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function hasDgisApiKey() {
  return Boolean(getDgisApiKey());
}

export type DgisFetchResult =
  | { ok: true; status: number; json: unknown }
  | { ok: false; status: number; error: 'no-key' | 'timeout' | 'upstream' | 'invalid-json' };

export async function dgisFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<DgisFetchResult> {
  const key = getDgisApiKey();
  if (!key) return { ok: false, status: 0, error: 'no-key' };

  const { timeoutMs = 12000, signal, ...rest } = init;
  const target = new URL(url);
  if (!target.searchParams.has('key')) target.searchParams.set('key', key);

  try {
    const timeouts = [AbortSignal.timeout(timeoutMs)];
    if (signal) timeouts.push(signal);
    const response = await fetch(target.toString(), {
      ...rest,
      cache: 'no-store',
      signal: AbortSignal.any(timeouts),
    });
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, status: response.status, error: 'invalid-json' };
    }
    if (!response.ok) return { ok: false, status: response.status, error: 'upstream' };
    return { ok: true, status: response.status, json };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError')
      return { ok: false, status: 0, error: 'timeout' };
    return { ok: false, status: 0, error: 'upstream' };
  }
}
