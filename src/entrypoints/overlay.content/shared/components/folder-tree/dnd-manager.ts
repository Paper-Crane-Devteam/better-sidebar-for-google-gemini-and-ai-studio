/**
 * One drag-and-drop manager, shared by every tree on the page.
 *
 * ## The bug this fixes
 *
 * `Cannot have two HTML5 backends at the same time.`
 *
 * react-arborist renders its own `<DndProvider backend={HTML5Backend}>` per `Tree`. When
 * no `manager` prop is given, react-dnd does not create a backend per provider — it
 * caches one manager on `window[Symbol.for('__REACT_DND_CONTEXT_INSTANCE__')]` and hands
 * the same one to everybody. That singleton is why several trees have always been able to
 * coexist here.
 *
 * The catch is how it is released. `DndProvider` keeps a module-level ref count and nulls
 * the cached manager when the last provider unmounts, while `HTML5Backend` is torn down
 * separately, when the manager's *handler* count reaches zero. The two are not
 * synchronised, and the backend's guard against a second instance is a flag on `window`
 * that only `teardown()` clears. Mount a provider in the window where the cache has been
 * cleared but the previous backend has not torn down, and the new backend's `setup()`
 * throws — which is what happened when the workspace tree mounted for the first time
 * after an upload, having not existed a moment earlier.
 *
 * ## The fix
 *
 * Own the manager instead of relying on that cache. `dndManager` is react-arborist's
 * supported hook for this, and when react-dnd sees a `manager` in props it short-circuits
 * entirely: no singleton lookup, no ref counting, no second backend. One manager is
 * created on first use and lives as long as the page.
 *
 * A module-level singleton rather than a React context because it must outlive every tree
 * — including the moment when zero trees are mounted, which is precisely the gap the ref
 * counting mishandles.
 *
 * ⚠️ Every `react-arborist` `Tree` in the app has to be given this manager, not just the
 * ones behind `FolderTree`. A tree left on the default would build its own manager from
 * the global cache, putting two managers on the page and bringing the original fault
 * straight back. `TimelineView` renders `Tree` directly and is wired up for that reason;
 * anything new that does the same needs the same prop.
 *
 * ⚠️ Passing a manager makes react-arborist's `dndRootElement` prop inert, since react-dnd
 * ignores `options` when it is handed a manager. Nothing uses that prop today. If a tree
 * ever needs a different root element, it needs its own manager built here with
 * `createDragDropManager(HTML5Backend, undefined, { rootElement })` — sharing one manager
 * and varying the root is not possible.
 */

import { HTML5Backend } from 'react-dnd-html5-backend';
import { createDragDropManager, type DragDropManager } from 'dnd-core';

let manager: DragDropManager | null = null;

/**
 * The shared manager, created on first call.
 *
 * Lazy so that merely importing this module does not reach for `window`. The backend
 * itself is not set up until a tree registers its first drag source, which is react-dnd's
 * own behaviour and unchanged here.
 */
export function getTreeDndManager(): DragDropManager {
  if (!manager) {
    // `rootElement` is left at its default of `window`. The panel lives in a shadow root,
    // but shadow DOM does not create a separate window and native drag events retarget
    // out to it — the same arrangement the trees already ran under.
    manager = createDragDropManager(HTML5Backend);
  }
  return manager;
}

/**
 * End a native (file) drag that react-dnd was left holding.
 *
 * `HTML5Backend` splits its work across both phases: the capture-phase listeners on
 * `window` begin a native drag as soon as files enter the page, while the cleanup lives in
 * the *bubble*-phase `drop` listener. A component that calls `stopPropagation()` on `drop`
 * — which the workspace tree does, so a file dropped on the sidebar cannot also reach the
 * host page's composer — therefore gets the setup but not the teardown, and the monitor
 * stays convinced a drag is in progress.
 *
 * It self-heals: the next `dragstart` calls `endDrag()` for exactly this case. But between
 * the two, `handleTopDragEnterCapture` bails out early whenever the monitor is already
 * dragging, so react-dnd sees nothing of any further file drags. Nothing visible breaks
 * (no tree target accepts native files) and our own handlers read `dataTransfer` directly,
 * but leaving a lie in the monitor is the kind of thing that surfaces later as an
 * unreproducible drag bug.
 *
 * ## What this does not fix
 *
 * `endDrag()` corrects the monitor, which is the part that changes behaviour. It cannot
 * unregister the native drag source, because the handle for it is private to the backend —
 * so each intercepted drop leaves one small entry behind in the handler registry. Bounded
 * by how many times a person drops files in a session, and it has a mild upside: a handler
 * count that never reaches zero means the backend is not torn down and set up again
 * between drags.
 *
 * The alternative was to let `drop` propagate and get the backend's own complete cleanup.
 * Rejected because the host page also listens for file drops, and files meant for the
 * workspace ending up attached to the chat composer is a worse outcome than a few stale
 * registry entries.
 *
 * Only meaningful for a component that stops `drop` from propagating. Everything else gets
 * the backend's own cleanup and should not call this.
 */
export function releaseNativeDrag(): void {
  // Not created yet means no backend, no listeners, and nothing to release.
  if (!manager) return;
  if (!manager.getMonitor().isDragging()) return;
  manager.getActions().endDrag();
}
