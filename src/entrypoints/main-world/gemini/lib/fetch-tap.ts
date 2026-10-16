/**
 * Observe a `fetch` without disturbing it: the page gets its own Response, untouched
 * and unawaited, and the observer gets a copy of both bodies on the side.
 *
 * Two orderings are load-bearing:
 * - A `Request`'s body can be read once, so it is cloned *before* `fetch` consumes it.
 * - The response clone is chained before the promise is handed back, so it runs ahead
 *   of the page's own `.then` and clones while the body is still unread. Cloning any
 *   later races the page and loses ("Response body is already used").
 */

export interface TappedExchange {
  url: string;
  status: number;
  requestBody: string | undefined;
  requestHeaders: Record<string, string>;
  responseText: string;
}

function readRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  const body = init?.body;
  if (typeof body === 'string') return Promise.resolve(body);
  if (body instanceof URLSearchParams) return Promise.resolve(body.toString());
  if (body == null && input instanceof Request) return input.clone().text().catch(() => undefined);
  return Promise.resolve(undefined);
}

function readHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (h: HeadersInit | undefined) => {
    if (h) new Headers(h).forEach((v, k) => (out[k] = v));
  };
  if (input instanceof Request) add(input.headers);
  add(init?.headers);
  return out;
}

export function tapFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: string,
  realFetch: typeof fetch,
  observe: (exchange: TappedExchange) => void,
): Promise<Response> {
  let bodyPromise: Promise<string | undefined>;
  let requestHeaders: Record<string, string> = {};
  try {
    bodyPromise = readRequestBody(input, init);
    requestHeaders = readHeaders(input, init);
  } catch {
    bodyPromise = Promise.resolve(undefined);
  }

  const resPromise = realFetch(input, init);
  const clonePromise = resPromise.then((res) => res.clone());

  void (async () => {
    try {
      const [requestBody, res] = await Promise.all([bodyPromise, clonePromise]);
      const responseText = await res.text();
      observe({ url, status: res.status, requestBody, requestHeaders, responseText });
    } catch {
      // A failed request or an unreadable body: nothing to observe.
    }
  })();

  return resPromise;
}
