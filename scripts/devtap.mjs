#!/usr/bin/env node
/**
 * devtap — read the running extension from the command line.
 *
 * This extension runs in six places at once (background service worker,
 * offscreen document, SQLite worker, document worker, content script, page
 * main-world) and each one has its own console in its own DevTools window. A bug
 * that crosses two of them has no single place you can read it, which is what
 * this exists to fix.
 *
 * It needs nothing inside the extension. `wxt.config.ts` already starts the dev
 * browser with `--remote-debugging-port=9222`, and Chrome will:
 *
 * - replay roughly the last 1000 console messages of every target on attach, so
 *   history is available without having been watching;
 * - keep object arguments reachable by handle, so `console.log('[DB Query]', sql,
 *   bind)` can be recovered in full instead of reading `Array(2)`;
 * - expose the background's `browser.*`, and the content script's isolated world
 *   along with it — which is how `sql` and `msg` work.
 *
 * Usage:
 *   node scripts/devtap.mjs <command> [options]
 *
 * Commands:
 *   targets                       Which contexts are alive right now
 *   logs                          Merged console history from every context
 *   watch                         Stream logs live to a file (blocks)
 *   eval <ctx> <expression>       Evaluate JS inside one context
 *   sql "<query>"                 Query the active profile's database
 *   msg <TYPE> [payloadJson]      Send an extension message, print the reply
 *   state                         Background storage, contexts, alarms
 *   snapshot                      All of the above into one file
 *   reload [--no-tabs]            Rebuild all entrypoints via the dev server,
 *                                 reload the extension and Gemini / AI Studio tabs
 *   net start|stop|clear [ctx]    Capture the host page's XHR + fetch with bodies
 *   net list|dump [ctx]           List / decode captured traffic (net.mjs)
 *   gsend "<text>" [--new]        Type and send a Gemini message (gemini-ui.mjs)
 *
 * Context labels:
 *   bg     background service worker
 *   off    offscreen document
 *   dbw    SQLite worker (reachable only through `off`, see contexts.mjs)
 *   docw   document parsing worker
 *   gem    a gemini.google.com tab — logs are tagged gem/main or gem/ext
 *   ais    an aistudio.google.com tab
 *
 * Options:
 *   --ctx bg,off,gem,ais,dbw      Restrict to these contexts
 *   --grep <regex>                Keep matching lines only (case-insensitive)
 *   --level warn|error            Minimum level
 *   --since 30s|5m                Only entries this recent
 *   -n, --limit <n>               Max entries / rows (default 300 logs, 50 rows)
 *   -o, --out <file>              Write here. `logs` defaults to a file; pass
 *                                 `--out=` to force stdout
 *   --maxval <n>                  Per-argument character cap (default 400)
 *   --json                        NDJSON instead of aligned text
 *   --stack                       Include stack frames
 *   --raw                         Skip object hydration (faster, lossier)
 *   --noise                       Keep the host page's own preload / deprecation
 *                                 warnings, which are dropped by default
 *   --write                       Allow a mutating SQL statement
 *   --port <n>                    CDP port (default 9222)
 *   --chrome[=<userDataDir>]      Attach to an everyday Chrome (remote debugging
 *                                 enabled at chrome://inspect/#remote-debugging)
 *                                 via scripts/devtap/relay.mjs if it is running
 *   --bctx <prefix>               With --chrome: only this browserContextId (profile)
 *   --page <substr>               sql/msg: send from tabs whose url / target id matches
 *   --quiet                       Suppress the "→ path" confirmation
 *
 * Examples:
 *   node scripts/devtap.mjs targets
 *   node scripts/devtap.mjs logs --ctx bg --grep 'AutoSync|Backup' -n 80
 *   node scripts/devtap.mjs logs --level warn --stack --out=
 *   node scripts/devtap.mjs logs --grep AgentLoop --since 2m
 *   node scripts/devtap.mjs sql "SELECT id, title FROM conversations LIMIT 5"
 *   node scripts/devtap.mjs eval bg 'JSON.stringify(await browser.alarms.getAll())'
 *   node scripts/devtap.mjs msg GET_FOLDERS
 *   node scripts/devtap.mjs snapshot
 */

import { parseArgs, die } from './devtap/args.mjs';
import { configureBrowserMode } from './devtap/cdp.mjs';
import {
  cmdEval,
  cmdLogs,
  cmdMsg,
  cmdReload,
  cmdSnapshot,
  cmdSql,
  cmdState,
  cmdTargets,
  cmdWatch,
} from './devtap/commands.mjs';
import { cmdNet } from './devtap/net.mjs';
import { cmdGsend } from './devtap/gemini-ui.mjs';

const COMMANDS = {
  net: cmdNet,
  gsend: cmdGsend,
  targets: cmdTargets,
  logs: cmdLogs,
  watch: cmdWatch,
  eval: cmdEval,
  sql: cmdSql,
  msg: cmdMsg,
  state: cmdState,
  snapshot: cmdSnapshot,
  reload: cmdReload,
};

const HELP = `devtap — read the running extension from the command line

  targets                     which contexts are alive
  logs                        merged console history (default → .kiro/devlog/logs.txt)
  watch                       stream live to a file (blocks)
  eval <ctx> <expr>           evaluate JS in one context
  sql "<query>"               query the active profile database
  msg <TYPE> [json]           send an extension message
  state                       background storage / contexts / alarms
  snapshot                    everything, into one file
  reload [--no-tabs]          rebuild + reload extension + host tabs
  net start|stop|clear [ctx]  capture the page's own XHR + fetch, bodies included
  net list|dump [ctx]         list / decode (batchexecute rpc, WebChannel protobuf)
                              → .kiro/devlog/net.txt   --grep <url re> --id 3,4
  gsend "<text>" [--new]      type + send a Gemini message, wait for the reply

contexts: bg  off  dbw  docw  gem  ais   (page logs are tagged gem/main, gem/ext)

  --ctx bg,dbw   --grep <re>   --level warn|error   --since 5m   -n <count>
  -o <file>      --json        --stack   --raw   --noise   --write
  --maxval 400   --port 9222   --quiet

Full notes: head -80 scripts/devtap.mjs
`;

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0];

  if (!command || flags.help) {
    process.stdout.write(HELP);
    return;
  }

  const run = COMMANDS[command];
  if (!run) {
    die(`unknown command "${command}"\n\n${HELP}`);
  }

  flags.port = Number(flags.port ?? 9222);

  // `--chrome` attaches to an everyday Chrome through its browser socket (see
  // configureBrowserMode). Bare `--chrome` means the default macOS user-data-dir.
  if (flags.chrome) {
    // Prefer the relay: it holds one approved connection, so no prompt per command.
    const relayed = await fetch('http://127.0.0.1:9339/run', {
      method: 'POST',
      body: JSON.stringify(process.argv.slice(2).filter((a) => !a.startsWith('--chrome'))),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (relayed) {
      process.stdout.write(relayed.out);
      process.exit(relayed.ok ? 0 : 1);
    }
    const userDataDir =
      flags.chrome === true || flags.chrome === 'true'
        ? `${process.env.HOME}/Library/Application Support/Google/Chrome`
        : flags.chrome;
    configureBrowserMode({ userDataDir, browserContext: flags.bctx });
  }

  await run(flags);

  // `watch` never gets here. For everything else, exit rather than waiting for
  // the event loop to drain: a socket to a target that stopped answering stays
  // open, and the process would appear to hang after the output was already
  // printed.
  if (command !== 'watch') process.exit(0);
}

main().catch((err) => die(err?.message ?? String(err)));
