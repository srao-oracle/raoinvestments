// Massive.com (= Polygon.io) REST client: auth, retry+jitter, pagination, single-flight
// dedupe, and a concurrency limiter to stay well under the ~100 req/s ceiling.

export interface MassiveClientOptions {
  apiKey?: string;
  baseUrl?: string;
  maxConcurrent?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export class MassiveError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "MassiveError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;
interface GetOpts {
  query?: Query;
  signal?: AbortSignal;
}

export interface MassiveClient {
  get<T>(path: string, opts?: GetOpts): Promise<T>;
  /** Yields each page's `results`, following `next_url`. */
  paginate<T>(path: string, opts?: GetOpts): AsyncGenerator<T[], void, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (attempt: number) =>
  Math.min(8000, 250 * 2 ** attempt) * (0.5 + Math.random());

function isRetryable(err: unknown): boolean {
  return (
    err instanceof TypeError || // fetch network failure
    (err instanceof DOMException && err.name === "TimeoutError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export function createMassiveClient(options: MassiveClientOptions = {}): MassiveClient {
  const apiKey = options.apiKey ?? process.env.MASSIVE_API_KEY;
  const baseUrl = (
    options.baseUrl ??
    process.env.MASSIVE_BASE_URL ??
    "https://api.massive.com"
  ).replace(/\/$/, "");
  const maxConcurrent = options.maxConcurrent ?? 40;
  const maxRetries = options.maxRetries ?? 4;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!apiKey) throw new Error("MASSIVE_API_KEY is not set");

  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (active >= maxConcurrent) await new Promise<void>((res) => waiters.push(res));
    active++;
  };
  const release = () => {
    active--;
    waiters.shift()?.();
  };

  const inflight = new Map<string, Promise<unknown>>();

  function buildUrl(path: string, query?: Query): string {
    const url = new URL(path.startsWith("http") ? path : baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    let attempt = 0;
    for (;;) {
      await acquire();
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const composite = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: composite,
        });
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          attempt++;
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(retryAfter > 0 ? retryAfter * 1000 : jitter(attempt));
          continue;
        }
        const text = await res.text();
        if (!res.ok) {
          throw new MassiveError(
            res.status,
            `Massive ${res.status}: ${text.slice(0, 200)}`,
            res.headers.get("x-request-id") ?? undefined,
          );
        }
        return JSON.parse(text) as T;
      } catch (err) {
        if (isRetryable(err) && attempt < maxRetries) {
          attempt++;
          await sleep(jitter(attempt));
          continue;
        }
        throw err;
      } finally {
        release();
      }
    }
  }

  async function get<T>(path: string, opts?: GetOpts): Promise<T> {
    const url = buildUrl(path, opts?.query);
    const existing = inflight.get(url) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fetchJson<T>(url, opts?.signal).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  async function* paginate<T>(
    path: string,
    opts?: GetOpts,
  ): AsyncGenerator<T[], void, unknown> {
    let url: string | undefined = buildUrl(path, opts?.query);
    while (url) {
      const page: { results?: T[]; next_url?: string } = await fetchJson(
        url,
        opts?.signal,
      );
      if (page.results?.length) yield page.results;
      url = page.next_url;
    }
  }

  return { get, paginate };
}

/** Shared default client (server-only). */
let _default: MassiveClient | undefined;
export function massive(): MassiveClient {
  return (_default ??= createMassiveClient());
}
