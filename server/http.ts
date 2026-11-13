/** Thrown for non-2xx responses. Carries the status but not the full URL. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    host: string,
  ) {
    super(`HTTP ${status} from ${host}`);
    this.name = 'HttpError';
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function request(url: string, opts: RequestOptions): Promise<Response> {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: opts.headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    // Node's "fetch failed" hides the real cause (DNS, TLS, refused connection) in err.cause.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message ?? (err instanceof Error ? err.name : 'error');
    throw new Error(`network error contacting ${host} (${detail})`);
  }
  if (!res.ok) throw new HttpError(res.status, host);
  return res;
}

export async function fetchJson(url: string, opts: RequestOptions = {}): Promise<unknown> {
  const res = await request(url, {
    ...opts,
    headers: { Accept: 'application/json', ...opts.headers },
  });
  return res.json();
}

export async function fetchText(url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await request(url, opts);
  return res.text();
}
