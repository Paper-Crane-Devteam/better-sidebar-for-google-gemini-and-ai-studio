/**
 * Ask for a workspace name.
 *
 * `modal` has no prompt variant — only `confirm`, whose `content` is free-form — so a
 * text input goes in there and the value is collected through a ref-free closure, the
 * same shape `SnippetsTab` uses for its create/edit forms.
 *
 * Resolves null when the user cancels or leaves the field empty, so the caller can tell
 * "no name given" from a name that happens to be whitespace.
 */

import React from 'react';
import { useModalStore } from '@/shared/lib/modal';
import i18n from '@/locale/i18n';

export function promptWorkspaceName(options: {
  title: string;
  confirmText: string;
  initialValue?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let value = options.initialValue ?? '';
    let settled = false;

    const finish = (result: string | null) => {
      // `onConfirm` and `onCancel` can both fire for one dismissal (confirm, then the
      // close handler); the promise must only settle once.
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const submit = () => {
      const trimmed = value.trim();
      useModalStore.getState().close();
      finish(trimmed || null);
    };

    useModalStore.getState().open({
      type: 'confirm',
      title: options.title,
      content: React.createElement('input', {
        type: 'text',
        defaultValue: value,
        autoFocus: true,
        maxLength: 60,
        placeholder: i18n.t('agent.workspace.namePlaceholder', {
          defaultValue: 'Workspace name',
        }),
        className:
          'w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm ' +
          'text-foreground placeholder:text-muted-foreground focus:outline-none ' +
          'focus:ring-1 focus:ring-primary/50',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          value = e.target.value;
        },
        // Enter is the expected way to accept a single-field dialog.
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        },
      }),
      confirmText: options.confirmText,
      cancelText: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
      onConfirm: submit,
      onCancel: () => {
        useModalStore.getState().close();
        finish(null);
      },
    });
  });
}
