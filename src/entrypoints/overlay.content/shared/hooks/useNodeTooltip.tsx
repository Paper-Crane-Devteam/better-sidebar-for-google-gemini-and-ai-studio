import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import type { FolderTreeNodeData } from '../components/folder-tree/types';
import type { NodeApi } from 'react-arborist';
import { useShallow } from 'zustand/react/shallow';

/**
 * Shared hook to build enriched tooltip content for tree node items (conversations).
 * Shows: title (only if truncated), tags (with color), description, created_at, last_active_at.
 * Used by explorer, gems, and notebooks.
 */
export function useNodeTooltip(node: NodeApi<FolderTreeNodeData>) {
  const { t } = useI18n();
  const {
    tags,
    conversationTags,
  } = useAppStore(
    useShallow((s) => ({
      tags: s.tags,
      conversationTags: s.conversationTags,
    })),
  );
  const isFile = node.data.type === 'file';
  const description = isFile ? (node.data.data?.description || '') : '';
  const hasDescription = description.length > 0;

  const itemTags = useMemo(() => {
    if (!isFile) return [];
    const tagIds = conversationTags
      .filter((ct) => ct.conversation_id === node.data.id)
      .map((ct) => ct.tag_id);
    return tags.filter((tag) => tagIds.includes(tag.id));
  }, [isFile, node.data.id, conversationTags, tags]);

  const createdAt = isFile ? node.data.data?.created_at : null;
  const lastActiveAt = isFile ? node.data.data?.last_active_at : null;

  const hasTags = itemTags.length > 0;
  const hasTimestamps = !!(createdAt || lastActiveAt);
  const hasExtraInfo = hasDescription || hasTags || hasTimestamps;

  const formatTs = (ts: number) => {
    const normalized = ts > 0 && ts < 100000000000 ? ts * 1000 : ts;
    return dayjs(normalized).format('lll');
  };

  const tooltipContent = isFile && hasExtraInfo
    ? (isOverflowing: boolean) => (
        <div className="flex flex-col gap-1">
          {isOverflowing && (
            <div className="font-medium">{node.data.name}</div>
          )}
          {hasTags && (
            <div className="flex flex-wrap gap-1">
              {itemTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-1 rounded text-[10px] leading-4 font-medium"
                  style={
                    tag.color
                      ? {
                          backgroundColor: `${tag.color}33`,
                          color: tag.color,
                        }
                      : {
                          backgroundColor: 'rgb(var(--muted) / 0.5)',
                          color: 'inherit',
                        }
                  }
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          {hasDescription && (
            <div className="text-[10px] opacity-80">{description}</div>
          )}
          {hasTimestamps && (
            <div className={`flex flex-col gap-0 text-[10px] opacity-60${(isOverflowing || hasTags || hasDescription) ? ' pt-1 border-t border-current/10' : ''}`}>
              {createdAt && (
                <span>{t('node.createdAt')}: {formatTs(createdAt)}</span>
              )}
              {lastActiveAt && (
                <span>{t('node.lastActiveAt')}: {formatTs(lastActiveAt)}</span>
              )}
            </div>
          )}
        </div>
      )
    : undefined;

  return { tooltipContent, forceShowTooltip: hasExtraInfo, hasDescription };
}
