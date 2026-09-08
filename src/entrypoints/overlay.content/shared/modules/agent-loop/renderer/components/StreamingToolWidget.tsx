/**
 * StreamingToolWidget — the placeholder standing in for a tool call the model is
 * still writing out.
 *
 * ## Why it exists
 *
 * A card can only be rendered once its `<bs_agent_tool>` block closes, because until
 * then there is no JSON to parse. With five calls in one turn that meant the view sat
 * empty and then filled in all at once — and since the engine starts asking for
 * approval as soon as the turn settles, the approval could arrive before its own card.
 *
 * So the opening tag alone is enough to put something in the right place. Each call
 * appears as it starts, shimmers while it is written, and is replaced by the real card
 * when the block closes. The gap is not padding: a `write_file` carrying a whole file
 * takes a while to come through.
 *
 * ## What it deliberately does not do
 *
 * No approval buttons, no status, no output, and no fingerprint — a pending call has no
 * parsed params, so it cannot be identified, and offering an action on it would let
 * someone approve a call whose arguments have not finished arriving.
 *
 * The tool name appears only once it is recognised, and the description only once its
 * closing quote has arrived (see `sniffToolName` / `sniffDescription`). A label that
 * visibly types itself reads as a rendering fault rather than as progress.
 */

import React from 'react';
import { Settings } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { getToolLabel } from '../../tool-labels';

/**
 * The moving band, scoped to this component.
 *
 * A `shimmer` keyframe does exist in `_common.scss`, but nested inside another rule —
 * so rather than depend on where that landed in the cascade, this ships its own under a
 * namespaced name. One `<style>` per mount is deduplicated by the browser, and it keeps
 * the animation with the thing it animates.
 */
const SHIMMER_CSS = `
@keyframes bs-tool-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.bs-tool-shimmer {
  background: linear-gradient(
    90deg,
    rgb(var(--muted-foreground) / 0.10) 25%,
    rgb(var(--muted-foreground) / 0.04) 50%,
    rgb(var(--muted-foreground) / 0.10) 75%
  );
  background-size: 200% 100%;
  animation: bs-tool-shimmer 1.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .bs-tool-shimmer { animation: none; }
}
`;

interface StreamingToolWidgetProps {
  /** '' until the name has arrived and matched a known tool */
  toolName: string;
  /** Absent until the model finished writing it */
  description?: string;
}

export const StreamingToolWidget: React.FC<StreamingToolWidgetProps> = ({
  toolName,
  description,
}) => {
  const { t } = useI18n();

  // The same label the settled card will show, so the swap is not a visible relabel.
  const label = description || (toolName ? getToolLabel(toolName, t) : '');

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border/40 bg-muted/30"
      aria-busy="true"
      aria-label={t('agent.tool.streaming', { defaultValue: 'Writing it out...' })}
    >
      <style>{SHIMMER_CSS}</style>
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-muted-foreground">
          <Settings className="h-3 w-3" />
        </span>

        {label ? (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
            {label}
          </span>
        ) : (
          // Nothing readable yet — a bar the width of a plausible label, rather than
          // an ellipsis that would sit where real text is about to go.
          <span className="bs-tool-shimmer h-3 flex-1 rounded" />
        )}

        <span className="bs-tool-shimmer ml-auto h-3 w-12 shrink-0 rounded" />
      </div>
    </div>
  );
};
