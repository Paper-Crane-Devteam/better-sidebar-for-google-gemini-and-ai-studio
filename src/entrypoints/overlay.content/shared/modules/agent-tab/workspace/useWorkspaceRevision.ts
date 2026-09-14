/**
 * A counter that bumps when the agent has touched the filesystem.
 *
 * The file panel reads once, on mount. That was correct while the user was the only one
 * opening it and the agent the only one writing to it — the two never overlapped. They do
 * now: the panel is a normal place to sit and watch a task run, and a tree that keeps
 * showing the state from before the first `write_file` reads as the agent having done
 * nothing at all.
 *
 * ## Why a counter, and not a callback
 *
 * Two consumers need this, and they need different things from it: the tree re-lists the
 * workspace, the reader re-reads one file. A number in a dependency array says that
 * without either of them registering a callback, and without this module knowing what
 * "refresh" means for either.
 *
 * ## Only while something is watching
 *
 * The subscription lives and dies with the component. Nothing here polls, nothing runs
 * when the Agent tab is on its launcher or the sidebar is on another tab — a panel that
 * is not mounted re-reads on its next mount anyway, which is the same answer for free.
 */

import { useEffect, useRef, useState } from 'react';
import { agentEventBus } from '../../agent-loop/event-bus';
import { WORKSPACE_WRITE_TOOLS } from '../../agent-loop/execution-policy';

/**
 * How long to wait for the writes to stop before re-reading.
 *
 * A round routinely contains several file calls, and each one ends with its own event.
 * Refreshing on every one would mean a handful of recursive listings across the message
 * bridge for one visible change. Long enough to collapse a burst, short enough that the
 * tree is up to date by the time the eye moves from the tool card to it.
 */
const SETTLE_MS = 400;

export function useWorkspaceRevision(): number {
  const [revision, setRevision] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = agentEventBus.on('tool:executed', ({ toolName }) => {
      if (!WORKSPACE_WRITE_TOOLS.includes(toolName)) return;

      /**
       * Deliberately not gated on `success`.
       *
       * A failed call is not the same as a call that changed nothing: `move` is
       * copy-then-delete, so a move that fails partway leaves both a partial copy and
       * the original (see `fs.movePath`). Refreshing when it turns out nothing moved
       * costs one listing; not refreshing leaves the user looking at a tree that does
       * not match their disk.
       */
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setRevision((n) => n + 1);
      }, SETTLE_MS);
    });

    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return revision;
}
