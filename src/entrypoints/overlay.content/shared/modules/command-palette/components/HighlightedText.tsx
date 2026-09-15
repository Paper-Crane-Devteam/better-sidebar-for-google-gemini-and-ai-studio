import React from 'react';
import type { HighlightSegment } from '../types';

/**
 * Draws pre-split text, tinting the runs that matched.
 *
 * The split happens where the query is known (see `lib/highlight`), so this stays
 * a dumb renderer and no component has to re-derive the match positions.
 */
export const HighlightedText = ({ segments }: { segments: HighlightSegment[] }) => (
  <>
    {segments.map((segment, i) =>
      segment.match ? (
        <span key={i} className="rounded-[2px] bg-highlight/65 text-foreground">
          {segment.text}
        </span>
      ) : (
        <React.Fragment key={i}>{segment.text}</React.Fragment>
      ),
    )}
  </>
);
