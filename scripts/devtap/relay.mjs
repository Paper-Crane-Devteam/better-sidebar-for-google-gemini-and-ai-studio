#!/usr/bin/env node
/**
 * devtap relay — hold ONE browser socket to an everyday Chrome and run devtap
 * commands over it.
 *
 * `chrome://inspect/#remote-debugging` asks the user to approve every new
 * client connection. devtap opens a fresh connection per command, which would
 * mean one prompt per command. This process connects once (one prompt), then
 * serves `POST /run` with an argv array; `devtap.mjs --chrome ...` forwards to it
 * automatically when it is running.
 *
 *   node scripts/devtap/relay.mjs [userDataDir]     # blocks; run in background
 *
 * Listens on 127.0.0.1 only. No auth: anything local can drive the browser
 * through it while it runs, so stop it when done.
 */
import http from 'node:http';
import { parseArgs } from './args.mjs';
import { configureBrowserMode, inBrowserMode, listTargets } from './cdp.mjs';
import * as commands from './commands.mjs';

export const RELAY_PORT = 9339;

const userDataDir =
  process.argv[2] || `${process.env.HOME}/Library/Application Support/Google/Chrome`;

const COMMANDS = {
  targets: commands.cmdTargets,
  logs: commands.cmdLogs,
  eval: commands.cmdEval,
  sql: commands.cmdSql,
  msg: commands.cmdMsg,
  state: commands.cmdState,
  snapshot: commands.cmdSnapshot,
};

// One command at a time: stdout capture and the context filter are global.
let queue = Promise.resolve();

async function runOnce(argv) {
  const flags = parseArgs(argv);
  flags.port = 0;
  const run = COMMANDS[flags._[0]];
  if (!run) return { ok: false, out: `relay: unsupported command "${flags._[0]}"\n` };

  configureBrowserMode({ userDataDir, browserContext: flags.bctx, keepConnection: true });

  let out = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => ((out += chunk), true);
  process.stderr.write = (chunk) => ((out += chunk), true);
  try {
    await run(flags);
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: out + `devtap: ${err?.message ?? err}\n` };
  } finally {
    process.stdout.write = origWrite;
    process.stderr.write = origErr;
  }
}

configureBrowserMode({ userDataDir, keepConnection: true });
if (!inBrowserMode()) throw new Error('browser mode not configured');
process.stdout.write(`relay: connecting to ${userDataDir} (approve the Chrome prompt)…\n`);
const targets = await listTargets(0);
process.stdout.write(`relay: connected, ${targets.length} targets. listening on ${RELAY_PORT}\n`);

http
  .createServer((req, res) => {
    // Ad-hoc probes: POST /js with a function body. It receives { cdp, contexts,
    // conn, attachByUrl } and its return value is sent back as JSON.
    if (req.method === 'POST' && req.url === '/js') {
      let src = '';
      req.on('data', (c) => (src += c));
      req.on('end', async () => {
        let result;
        try {
          const cdp = await import('./cdp.mjs');
          const contexts = await import('./contexts.mjs');
          const fn = new (Object.getPrototypeOf(async function () {}).constructor)(
            'h',
            src,
          );
          result = { ok: true, value: await fn({ cdp, contexts }) };
        } catch (err) {
          result = { ok: false, value: String(err?.stack ?? err) };
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      queue = queue.then(async () => {
        let result;
        try {
          result = await runOnce(JSON.parse(body));
        } catch (err) {
          result = { ok: false, out: `relay: ${err?.message ?? err}\n` };
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      });
    });
  })
  .listen(RELAY_PORT, '127.0.0.1');
