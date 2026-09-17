/**
 * A recorded browser state, drawn the way the browser draws it.
 *
 * Windows holding groups holding tabs; folders holding bookmarks. This is the shape that
 * answers the question someone actually has about a journal entry — "what did my browser
 * look like" — and the only one that can be held up against the real browser and checked by
 * eye. It is also why nothing here needs an id: a container is a node on screen, not a
 * number standing in for one.
 *
 * The nodes arrive fully resolved from the background, which has the whole snapshot. This
 * file composes no facts; it picks wording and indentation.
 *
 * ## Containers fold
 *
 * Indentation alone stopped being enough once this moved into a dialog of its own: a recorded
 * state is every non-incognito tab or the whole bookmark tree, which is routinely a few
 * hundred rows, and scrolling past a window you are not interested in to reach the one you
 * are is the whole problem. So every container with children gets a chevron, and starts open
 * — the default has to be the complete state, since that is what is being verified.
 *
 * ⚠️ Open state is per node instance and deliberately not lifted or persisted. Folding is a
 * reading aid within one look at one snapshot; remembering it across dialogs would mean a
 * tree that opens already hiding part of what the user came to check.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TreeEffect, TreeNode } from '@/shared/browser-agent/contracts';
import { useI18n } from '@/shared/hooks/useI18n';

type Translate = ReturnType<typeof useI18n>['t'];

const isContainer = (node: TreeNode) =>
  node.kind === 'window' || node.kind === 'pinned' || node.kind === 'group' || node.kind === 'folder';

/**
 * Chrome's nine group colours, as something to write with.
 *
 * The colour used to be a word beside the name — `Research grey` — which read as part of
 * the title and cost a line's worth of width on every group row to say something the user
 * can see at a glance in their own tab strip. Writing the name *in* the colour says the
 * same thing in no space at all, and matches how the group actually looks.
 *
 * ⚠️ Fixed hex, not theme tokens. These are the browser's colours, not the panel's, and a
 * group the user set to red has to read as red under every theme this extension ships.
 * They are mid-tones for that reason: each one has to hold contrast on a light background
 * and a dark one.
 *
 * ⚠️ Colour is never the only carrier. The name stays as text, and the colour's name goes
 * out to assistive technology below, so nothing here depends on being able to see it.
 */
const GROUP_COLORS: Record<string, string> = {
  grey: '#8a9199', blue: '#3b82c4', red: '#d1544a', yellow: '#b98900',
  green: '#2f9e56', pink: '#d1568f', purple: '#9161cc', cyan: '#2f95ad', orange: '#d1762f',
};

/** Windows and the pinned strip have no name of their own, so their label is their role. */
function label(node: TreeNode, t: Translate): string {
  if (node.kind === 'window') {
    if (node.hostWindow) return t('agent.browser.tree.thisWindow', { defaultValue: 'This window' });
    return node.window === undefined
      ? t('agent.browser.tree.window', { defaultValue: 'Window' })
      : t('agent.browser.tree.windowN', { n: node.window, defaultValue: 'Window {{n}}' });
  }
  if (node.kind === 'pinned') return t('agent.browser.tree.pinned', { defaultValue: 'Pinned' });
  if (node.kind === 'group' && !node.title) {
    return t('agent.browser.tree.unnamedGroup', { defaultValue: 'Unnamed group' });
  }
  return node.title || t('agent.browser.preview.untitled', { defaultValue: 'Untitled' });
}

/**
 * What a restore would do to this node, when the tree is being approved rather than read.
 *
 * `keep` says nothing. It is the answer for most of the tree, and a badge on every
 * unchanged row would bury the handful that are about to change.
 */
function Effect({ effect }: { effect?: TreeEffect }) {
  const { t } = useI18n();
  if (!effect || effect === 'keep') return null;
  const text = effect === 'reopen'
    ? t('agent.browser.tree.willReopen', { defaultValue: 'reopen' })
    : effect === 'create'
      ? t('agent.browser.tree.willCreate', { defaultValue: 'add back' })
      : t('agent.browser.tree.willRestore', { defaultValue: 'move back' });
  return <span className="ml-1.5 shrink-0 rounded bg-primary/15 px-1 text-[10px] text-primary">{text}</span>;
}

function Row({ node, depth }: { node: TreeNode; depth: number }) {
  const { t } = useI18n();
  const container = isContainer(node);
  const children = node.children ?? [];
  const foldable = container && children.length > 0;
  const [open, setOpen] = useState(true);

  return (
    <>
      <div
        className="flex items-start gap-1 py-px"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {/* A fixed slot either way, so a leaf's label lines up with its foldable siblings'
            rather than sitting a chevron's width to the left of them. */}
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={label(node, t)}
            onClick={() => setOpen((o) => !o)}
            className="mt-px shrink-0 text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" aria-hidden />
        )}
        <span
          className={container ? 'font-medium text-foreground' : 'text-muted-foreground'}
          style={node.color ? { color: GROUP_COLORS[node.color] } : undefined}
        >
          {label(node, t)}
          {/* Chrome names its group colours in English; a translated name keeps the row in
              one language. Spoken, not shown: on screen the colour *is* the name's colour,
              and a reader that cannot see it still needs to be told which group this is. */}
          {node.color && (
            <span className="sr-only">
              {' '}
              {t(`agent.browser.color.${node.color}`, { defaultValue: node.color })}
            </span>
          )}
        </span>
        <Effect effect={node.effect} />
        {/* The child count, so a folded container still says how much it is hiding. */}
        {foldable && !open && (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {t('agent.browser.tree.childCount', {
              count: children.length,
              defaultValue: '({{count}})',
            })}
          </span>
        )}
      </div>
      {/* One line, clipped. An address wrapped over three lines makes a tree of eighty tabs
          unreadable and pushes the rows that matter off screen — and the address is here to
          tell two same-titled pages apart, which the front of it already does. The whole
          thing is in `title` for anyone who needs the rest. */}
      {node.url && (
        <div
          title={node.url}
          className="truncate text-[10px] text-muted-foreground/70"
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
        >
          {node.url}
        </div>
      )}
      {open && children.map((child) => <Row key={child.key} node={child} depth={depth + 1} />)}
    </>
  );
}

export function BrowserTree({ nodes }: { nodes: TreeNode[] }) {
  const { t } = useI18n();
  if (!nodes.length) {
    return (
      <p className="text-muted-foreground">
        {t('agent.browser.tree.empty', { defaultValue: 'Nothing was recorded here.' })}
      </p>
    );
  }
  return (
    <div className="text-xs leading-snug">
      {nodes.map((node) => <Row key={node.key} node={node} depth={0} />)}
    </div>
  );
}
