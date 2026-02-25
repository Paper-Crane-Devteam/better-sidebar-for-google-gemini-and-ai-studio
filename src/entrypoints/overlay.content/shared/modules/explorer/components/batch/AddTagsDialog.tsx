import React, { useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils/utils';
import { Tag as TagIcon, Check } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';

interface AddTagsDialogProps {
  onSelectionChange: (tagIds: string[]) => void;
  initialSelectedIds?: string[];
}

export const AddTagsDialog = ({ onSelectionChange, initialSelectedIds = [] }: AddTagsDialogProps) => {
  const { t } = useI18n();
  const tags = useAppStore((state) => state.tags);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const toggleTag = (id: string) => {
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter(tagId => tagId !== id)
      : [...selectedIds, id];
    
    setSelectedIds(newSelection);
    onSelectionChange(newSelection);
  };

  return (
    <div className="min-h-[300px] max-h-[80vh] w-full border rounded-md">
      <ScrollArea className="h-full w-full p-2">
        <div className="flex flex-col gap-1">
          {tags.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              {t('tags.noTagsAvailable')}
            </div>
          )}
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={cn(
                'flex items-center justify-between py-2 px-3 rounded-sm hover:bg-accent cursor-pointer text-sm w-full',
                selectedIds.includes(tag.id) && 'bg-accent font-medium',
              )}
              onClick={() => toggleTag(tag.id)}
            >
              <div className="flex items-center gap-2">
                <TagIcon className="h-4 w-4 text-muted-foreground" />
                <span>{tag.name}</span>
              </div>
              {selectedIds.includes(tag.id) && (
                <Check className="h-4 w-4 text-foreground" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

