import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Gem as GemIcon, Search, Plus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { navigate } from '@/shared/lib/navigation';
import type { Gem } from '@/shared/types/db';

interface GemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastCreatedGemId?: string | null;
}

export const GemPickerDialog = ({
  open,
  onOpenChange,
  lastCreatedGemId,
}: GemPickerDialogProps) => {
  const { t } = useI18n();
  const { gems } = useAppStore();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const lastCreatedGem = useMemo(
    () => (lastCreatedGemId ? gems.find((g) => g.id === lastCreatedGemId) : null),
    [gems, lastCreatedGemId],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return gems;
    const q = search.toLowerCase();
    return gems.filter((g) => g.name.toLowerCase().includes(q));
  }, [gems, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const handleSelect = (gem: Gem) => {
    onOpenChange(false);
    navigate(`https://gemini.google.com/gems/${gem.id}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      style={{ zIndex: 200 }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm border bg-background shadow-lg rounded-lg overflow-hidden animate-in fade-in-0 zoom-in-95"
        style={{ zIndex: 201 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold">{t('gems.selectGem')}</h2>
          <button
            className="h-6 w-6 flex items-center justify-center rounded-sm hover:bg-muted/50 text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('gems.searchGems')}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 pl-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-[300px] overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
          {/* Last created gem shortcut */}
          {lastCreatedGem && !search.trim() && (
            <>
              <button
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left',
                  'hover:bg-accent/50 transition-colors',
                  'text-purple-600 dark:text-purple-400 font-medium',
                )}
                onClick={() => handleSelect(lastCreatedGem)}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {t('gems.chatWithLastGem', { name: lastCreatedGem.name })}
                </span>
              </button>
              <div className="h-px bg-border mx-1 my-1" />
            </>
          )}

          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-6">
              {t('gems.noGems')}
            </div>
          ) : (
            filtered.map((gem) => (
              <button
                key={gem.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left',
                  'hover:bg-accent/50 transition-colors',
                )}
                onClick={() => handleSelect(gem)}
              >
                <GemIcon className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="truncate">{gem.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
