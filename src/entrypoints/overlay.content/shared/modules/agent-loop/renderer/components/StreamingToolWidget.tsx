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
 * appears as it starts, spins while it is written, and is replaced by the real card
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
 *
 * The only motion here is the spinner in the icon slot. Everything else holds still, so
 * the swap to the settled card is a single change rather than a moving thing stopping.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { getToolLabel } from '../../tool-labels';

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

  const streamingLabel = t('agent.tool.streaming', { defaultValue: 'Writing it out...' });

  // The same label the settled card will show, so the swap is not a visible relabel.
  // Until anything is readable, the generic streaming line stands in — it occupies the
  // same slot the real label lands in, so nothing shifts when it arrives.
  const label = description || (toolName ? getToolLabel(toolName, t) : '') || streamingLabel;

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border/40 bg-muted/30"
      aria-busy="true"
      aria-label={streamingLabel}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
};
