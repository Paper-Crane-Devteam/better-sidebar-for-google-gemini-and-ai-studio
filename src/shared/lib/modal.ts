import { create } from 'zustand';
import React from 'react';
import i18n from '@/locale/i18n';
import { Trash2 } from 'lucide-react';

/** Single modal item in the stack */
export interface ModalState {
  id?: string;
  type: 'info' | 'confirm' | 'error' | 'warn';
  title: React.ReactNode;
  content: React.ReactNode;
  /** Optional slot in the top-right of the modal header for custom buttons/actions */
  headerActions?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** When true, the confirm button uses destructive styling (red) */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  modalClassName?: string;
}

const defaultModalState: ModalState = {
  type: 'info',
  title: '',
  content: null,
  headerActions: undefined,
  confirmText: '',
  cancelText: '',
  destructive: false,
  onConfirm: () => {},
  onCancel: () => {},
  modalClassName: undefined,
};

interface ModalStore {
  /** Stack of modals; top = last. Allows opening a modal from within another modal. */
  stack: ModalState[];
  open: (options: Partial<ModalState>) => void;
  /** Close the top modal (pop from stack) */
  close: () => void;
  /** Close all modals */
  closeAll: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  stack: [],
  open: (options) =>
    set((state) => {
      // If an id is provided, check if it already exists in the stack
      if (options.id) {
        const exists = state.stack.some((modal) => modal.id === options.id);
        if (exists) {
          return state;
        }
      }
      return {
        stack: [...state.stack, { ...defaultModalState, ...options }],
      };
    }),
  close: () =>
    set((state) => ({
      stack: state.stack.length > 0 ? state.stack.slice(0, -1) : [],
    })),
  closeAll: () => set({ stack: [] }),
}));

export const modal = {
  confirm: (options: {
    title: React.ReactNode;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    modalClassName?: string;
  }) => {
    return new Promise<boolean>((resolve) => {
      useModalStore.getState().open({
        type: 'confirm',
        title: options.title,
        content: options.content,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        destructive: options.destructive,
        modalClassName: options.modalClassName,
        onConfirm: () => {
          useModalStore.getState().close();
          resolve(true);
        },
        onCancel: () => {
          useModalStore.getState().close();
          resolve(false);
        },
      });
    });
  },
  info: (options: {
    title: React.ReactNode;
    content: React.ReactNode;
    confirmText?: string;
    modalClassName?: string;
  }) => {
    return new Promise<void>((resolve) => {
      useModalStore.getState().open({
        type: 'info',
        title: options.title,
        content: options.content,
        confirmText: options.confirmText,
        modalClassName: options.modalClassName,
        onConfirm: () => {
          useModalStore.getState().close();
          resolve();
        },
        onCancel: () => {
          useModalStore.getState().close();
          resolve();
        },
      });
    });
  },

  /**
   * Specialized delete confirmation modal.
   * Title shows a Trash2 icon + title text, confirm button is red/destructive.
   */
  confirmDelete: (options: {
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
  }) => {
    const deleteTitle = React.createElement(
      'span',
      { className: 'inline-flex items-center gap-2 text-destructive' },
      React.createElement(Trash2, { className: 'h-5 w-5' }),
      options.title,
    );

    return modal.confirm({
      title: deleteTitle,
      content: options.content,
      confirmText: options.confirmText || i18n.t('common.delete'),
      cancelText: options.cancelText || i18n.t('common.cancel'),
      destructive: true,
    });
  },
};
