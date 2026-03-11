import React, { useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus } from 'lucide-react';
import { TagItem } from './TagItem';
import { SidePanelMenu } from '../../components/menu/SidePanelMenu';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { TagColorDialog } from './TagColorDialog';

interface TagsTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
    onImportAiStudioSystem?: () => void;
  };
}

export const TagsTab = ({ menuActions }: TagsTabProps) => {
  const { t } = useI18n();
  const { tags, createTag } = useAppStore();
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    // Open color picker modal
    let selectedColor: string | null = null;
    const confirmed = await modal.confirm({
      title: t('tags.selectColor'),
      content: (
        <TagColorDialog
          initialColor={null}
          onColorChange={(color: string | null) => {
            selectedColor = color;
          }}
        />
      ),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      setIsCreating(true);
      await createTag(newTagName.trim(), selectedColor ?? undefined);
      setNewTagName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {t('tabs.tags')}
        </h1>
        <div className="flex gap-0.5 items-center">
          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      {/* Create Tag Input */}
      <div className="p-3 border-b flex gap-2">
        <Input
          placeholder={t('tags.newTagName')}
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
          maxLength={30}
          className="h-8 text-sm"
        />
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0"
          onClick={handleCreateTag}
          disabled={!newTagName.trim() || isCreating}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tags List */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col py-[2px]">
          {tags.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              {t('tags.noTagsYet')}
            </div>
          ) : (
            tags.map((tag) => <TagItem key={tag.id} tag={tag} />)
          )}
        </div>
      </div>
    </div>
  );
};
