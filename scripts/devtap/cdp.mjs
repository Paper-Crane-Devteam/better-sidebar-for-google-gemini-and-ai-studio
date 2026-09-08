/**
 * Minimal zero-dependency CDP client with flat-session multiplexing.
 *
 * Node 22 ships a global WebSocket, so nothing needs installing — which matters
 * because this has to keep working in a checkout where `node_modules` is stale
 * or absent.
 *
 * The multiplexing is not gold-plating. The SQLite worker lives *inside* the
 * offscreen document, and Chrome does not offer it as a usable top-level target:
 * `/json/list` shows a `worker` entry with an empty url that accepts messages and
 * answers none of them. The only way in is `Target.setAutoAttach` on the
 * offscreen document, which reports children as `sessionId`s on the same socket —
 * hence one connection, many sessions.
 */

/** One WebSocket, many CDP sessions. */
class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    /** sessionId (or '' for the root) → listener set */
    this.listeners = new Map();

    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
        return;
      }

      if (!msg.method) return;
      for (const fn of this.listeners.get(msg.sessionId ?? '') ?? []) fn(msg);

      // `Target.attachedToTarget` for a grandchild carries the *parent's*
      // sessionId, so a root that is auto-attaching has to see it too. Restricted
      // to `Target.*`: forwarding everything would make the offscreen document
      // report its workers' console output as its own, and every worker line would
      // show up twice.
      if (msg.sessionId && msg.method.startsWith('Target.')) {
        for (const fn of this.listeners.get('') ?? []) fn(msg);
      }
    });
  }

  subscribe(sessionId, fn) {
    const key = sessionId ?? '';
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  /**
   * A round trip, with a deadline.
   *
   * The deadline is not optional: a worker target Chrome attached in a paused
   * state accepts the message and simply never answers, and without a timeout the
   * whole tool hangs on it having printed nothing.
   */
  send(sessionId, method, params = {}, timeoutMs = 6000) {
    const id = ++this.nextId;
    const frame = { id, method, params };
    if (sessionId) frame.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      try {
        this.ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

/** A view onto one CDP session: the root target, or a child attached under it. */
export class Session {
  constructor(connection, sessionId = null, info = null) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.info = info;
  }

  on(fn) {
    return this.connection.subscribe(this.sessionId, fn);
  }

  send(method, params, timeoutMs) {
    return this.connection.send(this.sessionId, method, params, timeoutMs);
  }

  /** Fire and forget — for `*.enable` calls whose result nobody reads. */
  post(method, params = {}) {
    this.send(method, params).catch(() => {});
  }

  /** Only the root session owns the socket. */
  close() {
    if (!this.sessionId) this.connection.close();
  }

  /**
   * Attach to everything running underneath this target and return one Session
   * per child.
   *
   * `waitForDebuggerOnStart: false` matters: with it on, a worker created during
   * collection would sit paused forever waiting for us, which turns a read-only
   * diagnostic into something that breaks the app it is inspecting.
   */
  async children({ settleMs = 900 } = {}) {
    const found = [];
    const stop = this.connection.subscribe(this.sessionId, (msg) => {
      if (msg.method === 'Target.attachedToTarget') found.push(msg.params);
    });

    try {
      await this.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
      await new Promise((r) => setTimeout(r, settleMs));
    } catch {
      return [];
    } finally {
      stop();
    }

    return found.map(
      (p) => new Session(this.connection, p.sessionId, p.targetInfo),
    );
  }
}

export async function attach(target, timeoutMs = 5000) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`attach timeout: ${target.url || target.id}`)),
      timeoutMs,
    );
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`attach failed: ${target.url || target.id}`));
    });
  });
  return new Session(new Connection(ws), null, target);
}

export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
  if (!res) {
    throw new Error(
      `No CDP endpoint on 127.0.0.1:${port}. Start the dev browser with \`pnpm dev\` ` +
        `(wxt.config.ts already passes --remote-debugging-port=${port}).`,
    );
  }
  return res.json();
}

/**
 * Evaluate an expression and return its value, turning a thrown exception into a
 * rejected promise rather than a silently empty result.
 */
export async function evaluate(session, expression, opts = {}) {
  const { timeoutMs = 15000, ...rest } = opts;
  const res = await session.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true, ...rest },
    timeoutMs,
  );
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    throw new Error(d.exception?.description || d.text || 'evaluation threw');
  }
  return res.result?.value;
}
