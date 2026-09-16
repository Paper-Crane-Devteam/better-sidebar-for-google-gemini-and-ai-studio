import React from 'react';

interface IconBarGroupProps {
  /** Ids to render, in order, from `useIconBar().visible`. */
  ids?: string[];
  /** Every button this platform's rail can show, keyed by icon id. */
  nodes: Record<string, React.ReactNode>;
}

/**
 * Renders one block of the rail.
 *
 * The panels keep owning each button — what it does, which badge it carries,
 * whether it looks active — and hand them over as a lookup table. This only
 * decides which of them appear and in what order, so visibility and ordering
 * live in one place instead of being spelled out three times in JSX.
 *
 * Ids with no matching node are skipped rather than throwing: a stale persisted
 * order should not be able to blank the sidebar.
 */
export const IconBarGroup = ({ ids, nodes }: IconBarGroupProps) => (
  <>
    {(ids ?? []).map((id) =>
      nodes[id] ? <React.Fragment key={id}>{nodes[id]}</React.Fragment> : null,
    )}
  </>
);
