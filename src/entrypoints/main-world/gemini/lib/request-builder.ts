/**
 * Gemini batchexecute request builder.
 *
 * Captures shared parameters (headers, at token, f.sid, bl, reqid …)
 * from intercepted API traffic and exposes a simple `execute()` helper
 * that constructs & sends requests identical to the ones the Gemini
 * web UI makes.
 *
 * Usage (from main-world):
 *   import { geminiRequestBuilder } from '../lib/request-builder';
 *
 *   // 1. Feed it an intercepted request so it can learn the params:
 *   geminiRequestBuilder.learn(interceptedUrl, interceptedHeaders, interceptedBody);
 *
 *   // 2. Later, fire your own request:
 *   const res = await geminiRequestBuilder.execute({
 *     rpcid: 'MUAZcd',
 *     payload: [null, [["title"]], ["c_xxx", "New Name"]],
 *   });
 */

import { nativeFetch } from './native-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapturedParams {
  /** CSRF / anti-forgery token (the `at=` body param) */
  at: string;
  /** Session ID (`f.sid` query param) */
  fsid: string;
  /** Server build label (`bl` query param) */
  bl: string;
  /** Language (`hl` query param) */
  hl: string;
  /** Headers that stay constant across requests */
  headers: Record<string, string>;
}

export interface ExecuteOptions {
  /** The rpcid that identifies the operation, e.g. "MUAZcd" for rename */
  rpcid: string;
  /** The inner payload (will be JSON.stringify'd and wrapped) */
  payload: any;
  /** Optional: override source-path (defaults to current pathname) */
  sourcePath?: string;
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let captured: CapturedParams | null = null;

/**
 * _reqid counter.
 * The last 5 digits are fixed per session; the prefix increments.
 * We extract the fixed suffix + current prefix from the first intercepted
 * request and keep incrementing from there.
 */
let reqidSuffix = '';   // e.g. "46304"
let reqidPrefix = 0;    // e.g. 60

let lastLearnedFingerprint = '';

/**
 * `/u/N` of the signed-in account this tab is using, or '' for the default account.
 *
 * Google picks the account from the path, not the cookies: `/_/BardChatUi/…` is
 * account 0, `/u/2/_/BardChatUi/…` is account 2. A request built without it reads
 * the *default* account's data with this tab's tokens, which Gemini answers with
 * HTTP 400 — or, for an id that happens to exist there, with someone else's chat.
 */
let accountPrefix: string | null = null;

const ACCOUNT_PREFIX_RE = /^\/u\/\d+(?=\/)/;

function prefixFromPath(pathname: string): string | null {
  const m = ACCOUNT_PREFIX_RE.exec(pathname);
  return m ? m[0] : null;
}

/** The prefix learned from page traffic, else the tab's own URL, else none. */
function currentAccountPrefix(): string {
  return accountPrefix ?? prefixFromPath(location.pathname) ?? '';
}

/** Prefix a page path (`/app/<id>`) with the account, unless it already has one. */
function withAccountPrefix(path: string, prefix: string): string {
  if (!prefix || ACCOUNT_PREFIX_RE.test(path)) return path;
  return `${prefix}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextReqid(): string {
  reqidPrefix += 1;
  return `${reqidPrefix}${reqidSuffix}`;
}

function parseReqid(raw: string) {
  // The suffix is the last 5 chars, prefix is everything before that.
  if (raw.length <= 5) {
    reqidSuffix = raw;
    reqidPrefix = 0;
  } else {
    reqidSuffix = raw.slice(-5);
    reqidPrefix = parseInt(raw.slice(0, -5), 10) || 0;
  }
}

/**
 * Build the `f.req` value for a single-rpc batchexecute call.
 *
 * Structure: `[[[rpcid, JSON.stringify(payload), null, "generic"]]]`
 */
function buildFReq(rpcid: string, payload: any): string {
  const inner = JSON.stringify(payload);
  return JSON.stringify([[[rpcid, inner, null, 'generic']]]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const geminiRequestBuilder = {
  /** Whether we have captured enough info to build requests */
  get ready(): boolean {
    return captured !== null;
  },

  /**
   * Learn / update shared parameters from an intercepted batchexecute call.
   *
   * Call this from the ajax-hook `onRequest` or `onResponse` callback
   * whenever you see a batchexecute URL.
   */
  learn(url: string, headers: Record<string, string>, body?: string) {
    try {
      const u = new URL(url, location.origin);
      const params = u.searchParams;

      // The page's own requests carry the account in their path; '' is account 0.
      if (u.pathname.includes('/_/BardChatUi/')) {
        accountPrefix = prefixFromPath(u.pathname) ?? '';
      }

      // Extract reqid for counter sync
      const reqidRaw = params.get('_reqid');
      if (reqidRaw) {
        parseReqid(reqidRaw);
      }

      // Extract stable query params
      const fsid = params.get('f.sid') || captured?.fsid || '';
      const bl = params.get('bl') || captured?.bl || '';
      const hl = params.get('hl') || captured?.hl || 'en';

      // Extract `at` token from body
      let at = captured?.at || '';
      if (body) {
        try {
          const bp = new URLSearchParams(body);
          at = bp.get('at') || at;
        } catch {
          const m = body.match(/at=([^&]*)/);
          if (m?.[1]) at = decodeURIComponent(m[1]);
        }
      }

      // Merge headers — keep only the ones we care about
      const KEEP_HEADERS = [
        'x-client-data',
        'x-browser-channel',
        'x-browser-copyright',
        'x-browser-validation',
        'x-browser-year',
        'x-goog-ext-525001261-jspb',
        'x-goog-ext-73010989-jspb',
        'x-same-domain',
      ];

      const kept: Record<string, string> = captured?.headers
        ? { ...captured.headers }
        : {};
      for (const key of KEEP_HEADERS) {
        const lk = key.toLowerCase();
        // headers might come with original casing
        const val =
          headers[key] ?? headers[lk] ?? headers[key.toUpperCase()];
        if (val !== undefined) {
          kept[lk] = val;
        }
      }

      captured = { at, fsid, bl, hl, headers: kept };

      const fingerprint = `${fsid}|${bl}|${hl}|${at}|${Object.keys(kept).sort().join(',')}`;
      if (fingerprint !== lastLearnedFingerprint) {
        lastLearnedFingerprint = fingerprint;
        console.log('Better Sidebar (Gemini): Request builder params updated', {
          fsid,
          bl,
          hl,
          at: at ? `${at.slice(0, 10)}…` : '(empty)',
          headerCount: Object.keys(kept).length,
        });
      }
    } catch (e) {
      console.error(
        'Better Sidebar (Gemini): Failed to learn request params',
        e,
      );
    }
  },

  /**
   * Update the reqid counter from a newly intercepted request.
   * Call this on every intercepted batchexecute so the counter stays in sync.
   */
  syncReqid(url: string) {
    try {
      const u = new URL(url, location.origin);
      const raw = u.searchParams.get('_reqid');
      if (raw) parseReqid(raw);
    } catch {
      // ignore
    }
  },

  /**
   * Execute a batchexecute request against the Gemini API.
   *
   * Returns the raw Response object so callers can parse as needed.
   */
  async execute(opts: ExecuteOptions): Promise<Response> {
    if (!captured) {
      throw new Error(
        'geminiRequestBuilder: not ready — no intercepted request learned yet',
      );
    }

    const { rpcid, payload, sourcePath } = opts;
    const { at, fsid, bl, hl, headers: capturedHeaders } = captured;

    const reqid = nextReqid();
    const prefix = currentAccountPrefix();
    // Callers pass account-less paths like `/app/<id>`; the page sends `/u/2/app/<id>`.
    const sp = withAccountPrefix(sourcePath || location.pathname, prefix);

    // Build URL
    const qp = new URLSearchParams({
      rpcids: rpcid,
      'source-path': sp,
      bl,
      'f.sid': fsid,
      hl,
      _reqid: reqid,
      rt: 'c',
    });
    const url = `https://gemini.google.com${prefix}/_/BardChatUi/data/batchexecute?${qp.toString()}`;

    // Build body
    const bodyParams = new URLSearchParams({
      'f.req': buildFReq(rpcid, payload),
      at,
    });

    // Build headers
    const finalHeaders: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...capturedHeaders,
    };

    console.log(
      `Better Sidebar (Gemini): Executing ${rpcid} (reqid=${reqid}${prefix ? `, account ${prefix}` : ''})`,
    );

    // Not the global `fetch`: that one is the interceptor, which would route this
    // response back into the page-traffic handlers.
    return nativeFetch(url, {
      method: 'POST',
      headers: finalHeaders,
      body: bodyParams.toString(),
      credentials: 'include',
      mode: 'cors',
    });
  },
};
