// src/read/url.ts -- one of wikeeper's two network uses (STORY-003-10 R6); the other is the version check in src/core/update-check.ts, which calls fetchSource.
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { formatSize } from "../ingest/report.js";

export const USER_AGENT = "Mozilla/5.0 (compatible; wikeeper; +https://github.com/sandrinio/wikeeper)";
const ACCEPT = "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8";

export interface FetchedSource {
  bytes: Uint8Array;
  contentType: string | null;
  finalUrl: string;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

/** The network error code (ECONNREFUSED, …) when there is one, else the error's message. */
function causeOf(err: unknown): string {
  return (err as { cause?: { code?: string } }).cause?.code ?? (err instanceof Error ? err.message : String(err));
}

function tooLarge(maxBytes: number): WikeeperError {
  return new WikeeperError(ExitCode.ERROR, "too_large", `the response is larger than ${formatSize(maxBytes)}`, {
    limit_bytes: maxBytes,
  });
}

function timeout(url: URL, timeoutMs: number): WikeeperError {
  return new WikeeperError(ExitCode.ERROR, "timeout", `${url.href} did not finish within ${timeoutMs / 1000} s`, {
    url: url.href,
    timeout_ms: timeoutMs,
  });
}

export async function fetchSource(
  url: URL,
  opts: { timeoutMs: number; maxBytes: number; fetch: typeof fetch },
): Promise<FetchedSource> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let res: Response;
  try {
    res = await opts.fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: ACCEPT },
      redirect: "follow",
      signal,
    });
  } catch (err) {
    if (isTimeout(err)) throw timeout(url, opts.timeoutMs);
    const cause = causeOf(err);
    throw new WikeeperError(ExitCode.ERROR, "fetch_failed", `could not fetch ${url.href}: ${cause}`, {
      url: url.href,
      cause,
    });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new WikeeperError(ExitCode.ERROR, "http_error", `${url.href} answered ${res.status}`, {
      status: res.status,
      url: res.url || url.href,
    });
  }
  const declared = res.headers.get("content-length");
  if (declared !== null && Number(declared) > opts.maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw tooLarge(opts.maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body !== null) {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > opts.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw tooLarge(opts.maxBytes);
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof WikeeperError) throw err;
      if (isTimeout(err)) throw timeout(url, opts.timeoutMs);
      const cause = causeOf(err);
      throw new WikeeperError(ExitCode.ERROR, "fetch_failed", `could not read ${url.href}: ${cause}`, {
        url: url.href,
        cause,
      });
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { bytes, contentType: res.headers.get("content-type"), finalUrl: res.url || url.href };
}
