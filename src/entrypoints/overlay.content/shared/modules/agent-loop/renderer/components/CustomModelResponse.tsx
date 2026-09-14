/**
 * CustomModelResponse — Renders model AI turn as full-width markdown content.
 * No bubble — flat layout similar to Gemini's native style.
 * Embeds ToolCallWidgets inline within markdown content.
 *
 * The prose/tool interleaving itself lives in `helpers/model-prose`, because the
 * session-end marker has to ask the same question of the same split — see there.
 */

import React from 'react';
import type { DisplayMessageTurn } from '../useConversationMessages';

import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { ToolCallWidget } from './ToolCallWidget';
import { StreamingToolWidget } from './StreamingToolWidget';
import { splitTurnContent } from '../helpers/model-prose';

interface CustomModelResponseProps {
  message: DisplayMessageTurn;
  /** True for the newest model turn — only there can tools be run manually */
  isLatestResponse?: boolean;
}

export const CustomModelResponse: React.FC<CustomModelResponseProps> = ({
  message,
  isLatestResponse = false,
}) => {
  const parts = splitTurnContent(message);

  return (
    <div className="my-6 w-full">
      {/* Streaming indicator — removed: the dock pill already shows "Thinking…"
          and the spinning dot, so the per-turn tag was redundant visual noise. */}

      {/* Content — full-width, no bubble */}
      <div className="text-[rgb(var(--foreground))]">
        {parts.map((part, i) => {
          if (part.kind === 'text') {
            return (
              <MarkdownRenderer
                key={`text-${i}`}
                className={`leading-relaxed ${part.trailing ? (i > 0 ? 'mt-2' : '') : 'mb-2'}`}
              >
                {part.text}
              </MarkdownRenderer>
            );
          }

          if (part.kind === 'pending-tool') {
            // Same key as the settled card it becomes, so React swaps the node in
            // place instead of unmounting one card and mounting another — which would
            // read as the call disappearing and a different one taking its place.
            return (
              <StreamingToolWidget
                key={`tool-${part.index}`}
                toolName={part.call.toolCall.name}
                description={part.call.toolCall.description}
              />
            );
          }

          return (
            <ToolCallWidget
              key={`tool-${part.index}`}
              toolName={part.call.toolCall.name}
              description={part.call.toolCall.description}
              query={part.call.toolCall.params.query || part.call.toolCall.params.summary}
              rawText={part.call.matchString}
              isLatestResponse={isLatestResponse}
              outcome={message.toolOutcomes[part.index] ?? null}
            />
          );
        })}
      </div>
    </div>
  );
};
