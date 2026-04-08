/**
 * AI Studio request builder.
 *
 * Captures shared parameters (authorization, api-key, headers …)
 * from intercepted API traffic and exposes helpers to call
 * AI Studio gRPC-web endpoints.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapturedParams {
  authorization: string;
  apiKey: string;
  authUser: string;
  visitId: string;
  headers: Record<string, string>;
}

export interface AiStudioExecuteOptions {
  /** gRPC method path, e.g. "DeletePrompt" */
  method: string;
  /** JSON body (will be JSON.stringify'd) */
  body: any;
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let captured: CapturedParams | null = null;

const BASE_URL =
  'https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const aiStudioRequestBuilder = {
  get ready(): boolean {
    return captured !== null;
  },

  /**
   * Learn shared parameters from an intercepted request.
   */
  learn(url: string, headers: Record<string, string>) {
    try {
      if (!url.includes('alkalimakersuite-pa.clients6.google.com')) return;

      const KEEP_HEADERS = [
        'authorization',
        'x-goog-api-key',
        'x-goog-authuser',
        'x-aistudio-visit-id',
        'x-browser-channel',
        'x-browser-copyright',
        'x-browser-validation',
        'x-browser-year',
        'x-client-data',
        'x-goog-ext-519733851-bin',
        'x-user-agent',
      ];

      const kept: Record<string, string> = captured?.headers
        ? { ...captured.headers }
        : {};
      for (const key of KEEP_HEADERS) {
        const lk = key.toLowerCase();
        const val = headers[key] ?? headers[lk] ?? headers[key.toUpperCase()];
        if (val !== undefined) {
          kept[lk] = val;
        }
      }

      captured = {
        authorization: kept['authorization'] || captured?.authorization || '',
        apiKey: kept['x-goog-api-key'] || captured?.apiKey || '',
        authUser: kept['x-goog-authuser'] || captured?.authUser || '0',
        visitId: kept['x-aistudio-visit-id'] || captured?.visitId || '',
        headers: kept,
      };

      console.log('Better Sidebar (AI Studio): Request builder params updated', {
        hasAuth: !!captured.authorization,
        hasApiKey: !!captured.apiKey,
        headerCount: Object.keys(kept).length,
      });
    } catch (e) {
      console.error('Better Sidebar (AI Studio): Failed to learn request params', e);
    }
  },

  /**
   * Execute a gRPC-web request against the AI Studio API.
   */
  async execute(opts: AiStudioExecuteOptions): Promise<Response> {
    if (!captured) {
      throw new Error('aiStudioRequestBuilder: not ready — no intercepted request learned yet');
    }

    const { method, body } = opts;
    const url = `${BASE_URL}/${method}`;

    const finalHeaders: Record<string, string> = {
      'content-type': 'application/json+protobuf',
      accept: '*/*',
      ...captured.headers,
    };

    console.log(`Better Sidebar (AI Studio): Executing ${method}`);

    return fetch(url, {
      method: 'POST',
      headers: finalHeaders,
      body: JSON.stringify(body),
      credentials: 'include',
      mode: 'cors',
    });
  },
};
