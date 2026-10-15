import React, { useState } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { useConversationMessagesStore } from '@/shared/lib/conversation-messages-store';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';

/**
 * Escape hatch for a conversation whose saved messages no longer match what the
 * platform renders — leftovers from before re-edit/regenerate started deleting
 * the branch it replaced, or any other drift that makes this bar look wrong.
 *
 * Deliberately blunt: it wipes every stored message for the conversation and
 * reloads, letting the normal capture path rebuild from the platform's own
 * history. No detection, no partial diff — the previous version tried to work out
 * exactly which rows were dead, and that was both hard to trust and hard to
 * reach. The rows are a local cache of the platform transcript, so nothing the
 * user cannot get back is at stake.
 *
 * Always rendered in the expanded header (never in the collapsed dot bar), so the
 * affordance is there whenever someone needs it. The confirm dialog is what keeps
 * a stray click harmless.
 */
export const EraseMessagesButton: React.FC = () => {
  const { t } = useI18n();
  const conversationDbId = useConversationMessagesStore((s) => s.conversationDbId);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;

    if (!conversationDbId) {
      toast.error(t('smartScrollbar.eraseNoConversation'));
      return;
    }

    const confirmed = await modal.confirmDelete({
      title: t('smartScrollbar.eraseConfirmTitle'),
      content: t('smartScrollbar.eraseConfirmContent'),
      confirmText: t('smartScrollbar.eraseConfirmAction'),
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'DELETE_MESSAGES_BY_CONVERSATION_ID',
        payload: { conversationId: conversationDbId },
      });
      if (!response?.success) {
        throw new Error(response?.error || 'DELETE_MESSAGES_BY_CONVERSATION_ID failed');
      }
      // Reload rather than patching the store: the point is to re-capture from
      // the platform, and a fresh page load is the only path that does that.
      globalThis.location.reload();
    } catch (e) {
      console.error('SmartScrollbar: erase messages failed', e);
      toast.error(t('smartScrollbar.eraseFailed'));
      setBusy(false);
    }
  };

  return (
    <SimpleTooltip
      content={t('smartScrollbar.eraseTooltip')}
      side="left"
      sideOffset={8}
      delayDuration={100}
    >
      <button
        onClick={handleClick}
        disabled={busy}
        aria-label={t('smartScrollbar.eraseTooltip')}
        className={cn(
          'flex items-center justify-center shrink-0 px-3 py-2',
          'transition-colors duration-150',
          'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Eraser className="h-4 w-4 shrink-0" />
        )}
      </button>
    </SimpleTooltip>
  );
};
