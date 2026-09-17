/**
 * DestinationRow — a full-width row in an agent panel that opens somewhere else.
 *
 * Shared by every agent panel, because "go here" reads the same wherever it appears and the
 * three panels differing in how they drew it was an accident of the order they were built.
 * The Browser panel used a pair of outline `Button`s, which on a sidebar this narrow sat as
 * two small framed pills under sections that have no frames at all, and read as controls that
 * act on the panel rather than as ways out of it.
 *
 * Shape: icon, label, chevron, on the same tinted `-mx-2 px-2` band the rest of the panel
 * uses so the tint bleeds outward and the label keeps the shared left edge. Full width rather
 * than a grid — side by side each row gets about twenty characters and every label wraps.
 *
 * No supporting line under the label. It used to take one, and the descriptions were the kind
 * of copy that explains a label already clear enough to click ("Skills & tools" / "What it may
 * do, and when to ask"), so it cost a line of height per row and told the reader nothing.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface DestinationRowProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

export const DestinationRow: React.FC<DestinationRowProps> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg bg-muted/40 px-2 py-2
               text-left transition-colors hover:bg-accent/40"
  >
    <span className="shrink-0 text-primary">{icon}</span>
    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{label}</span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
  </button>
);
