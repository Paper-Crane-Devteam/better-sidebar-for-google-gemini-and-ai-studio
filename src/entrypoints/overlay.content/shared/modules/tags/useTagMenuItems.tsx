import React from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { Edit2, Trash2, Palette } from 'lucide-react';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { Tag } from '@/shared/types/db';
import { ColorPickerGrid } from '../../components/ColorPickerGrid';

interface UseTagMenuItemsParams {
  tag: Tag;
  onRename: () => void;
  onDelete: () => void;
  onColorChange: (color: string | null) => void;
}

export function useTagMenuItems({
  tag,
  onRename,
  onDelete,
  onColorChange,
}: UseTagMenuItemsParams): MenuEntryDef[] {
  const { t } = useI18n();

  return [
    {
      type: 'item' as const,
      key: 'rename',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('tags.rename'),
      onClick: onRename,
    },
    {
      type: 'sub' as const,
      key: 'change-color',
      icon: <Palette className="h-4 w-4" />,
      label: t('tags.changeColor'),
      contentClassName: 'w-auto p-2',
      children: (
        <ColorPickerGrid
          selectedColor={tag.color}
          onColorChange={onColorChange}
          allowCustom
        />
      ),
    },
    { type: 'separator' as const, key: 'sep' },
    {
      type: 'item' as const,
      key: 'delete',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('common.delete'),
      className: 'text-destructive focus:text-destructive',
      onClick: onDelete,
    },
  ];
}
