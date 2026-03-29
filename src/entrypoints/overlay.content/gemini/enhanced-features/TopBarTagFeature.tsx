import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useUrl } from '@/shared/hooks/useUrl';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useAppStore } from '@/shared/lib/store';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { applyShadowStyles } from '@/shared/lib/utils';
import { Tag as TagIcon, Plus, X, Pencil, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import mainStyles from '@/index.scss?inline';
import { useI18n } from '@/shared/hooks/useI18n';

const TopBarTagUI = ({ container }: { container: Element }) => {
  const { t } = useI18n();
  const currentConversationId = useCurrentConversationId();
  const {
    tags,
    conversationTags,
    addTagToConversation,
    removeTagFromConversation,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editingTagIds, setEditingTagIds] = useState<string[]>([]);

  useEffect(() => {
    const centerSection = (container.getRootNode() as ShadowRoot)?.host
      ?.parentElement;
    if (centerSection) {
      const handleEnter = () => setIsHovered(true);
      const handleLeave = () => setIsHovered(false);

      // Check initial state
      if (centerSection.matches(':hover')) {
        setIsHovered(true);
      }

      centerSection.addEventListener('mouseenter', handleEnter);
      centerSection.addEventListener('mouseleave', handleLeave);
      return () => {
        centerSection.removeEventListener('mouseenter', handleEnter);
        centerSection.removeEventListener('mouseleave', handleLeave);
      };
    }
  }, [container]);

  // Stop propagation so clicking the dropdown doesn't trigger parent events
  const stopPropagation = (
    e: React.MouseEvent | React.TouchEvent | React.PointerEvent,
  ) => {
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  const activeTags = React.useMemo(() => {
    if (!currentConversationId) return [];
    const tagIds = conversationTags
      .filter((ct) => ct.conversation_id === currentConversationId)
      .map((ct) => ct.tag_id);
    return tags.filter((t) => tagIds.includes(t.id));
  }, [currentConversationId, conversationTags, tags]);

  const displayTags = React.useMemo(() => {
    if (isEditing) {
      return tags.filter((t) => editingTagIds.includes(t.id));
    }
    return activeTags;
  }, [isEditing, editingTagIds, activeTags, tags]);

  const availableTags = React.useMemo(() => {
    return tags.filter(
      (t) => !displayTags.find((active) => active.id === t.id),
    );
  }, [tags, displayTags]);

  const handleStartEdit = () => {
    setEditingTagIds(activeTags.map((t) => t.id));
    setIsEditing(true);
  };

  const handleAddExistingTag = (tagId: string) => {
    setEditingTagIds((prev) => [...prev, tagId]);
    setIsOpen(false);
  };

  const handleRemoveEditingTag = (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const handleConfirm = async () => {
    const currentTagIds = activeTags.map((t) => t.id);
    const tagsToAdd = editingTagIds.filter((id) => !currentTagIds.includes(id));
    const tagsToRemove = currentTagIds.filter(
      (id) => !editingTagIds.includes(id),
    );

    if (currentConversationId) {
      for (const id of tagsToAdd) {
        await addTagToConversation(currentConversationId, id);
      }
      for (const id of tagsToRemove) {
        await removeTagFromConversation(currentConversationId, id);
      }
    }
    setIsEditing(false);
    setIsHovered(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsHovered(false);
  };

  if (!currentConversationId) return null;

  return ReactDOM.createPortal(
    <div
      className="flex items-center gap-1.5 mx-2 h-full min-w-[24px] transition-all"
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
    >
      {displayTags.map((tag) => (
        <SimpleTooltip key={tag.id} content={tag.name}>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: tag.color || 'rgb(var(--foreground))',
              border: `1px solid ${tag.color || 'rgb(var(--border))'}`,
            }}
          >
            <span className="truncate max-w-[120px]">{tag.name}</span>
            {isEditing && (
              <SimpleTooltip content={t('topBarTag.removeTag')}>
                <div
                  className="flex items-center justify-center rounded-sm hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer p-0.5 -mr-1 shrink-0 ml-1"
                  onClick={(e) => handleRemoveEditingTag(tag.id, e)}
                >
                  <X className="w-2.5 h-2.5 opacity-70 hover:opacity-100" />
                </div>
              </SimpleTooltip>
            )}
          </span>
        </SimpleTooltip>
      ))}

      {!isEditing && (
        <SimpleTooltip content={t('topBarTag.editTags')}>
          <button
            onClick={handleStartEdit}
            className={`flex items-center justify-center w-6 h-6 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-all outline-none shrink-0 ${
              isHovered ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </SimpleTooltip>
      )}

      {isEditing && (
        <div className="flex items-center gap-1 ml-1">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <SimpleTooltip content={t('topBarTag.addTag')}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors outline-none shrink-0 border border-dashed border-border">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent
              container={container as HTMLElement}
              align="start"
              className="w-[180px] p-2 z-[9999]"
            >
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                {t('topBarTag.selectTags')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-[200px] overflow-y-auto w-full flex flex-col gap-1 pr-1">
                {availableTags.length === 0 && (
                  <span className="text-xs text-muted-foreground px-2 py-1">
                    {t('topBarTag.noTagsAvailable')}
                  </span>
                )}
                {availableTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddExistingTag(tag.id);
                    }}
                    className="flex items-center gap-2 cursor-pointer text-xs focus:bg-accent rounded-sm px-2 py-1.5"
                  >
                    <TagIcon
                      className="w-3.5 h-3.5"
                      style={{ color: tag.color || 'inherit' }}
                    />
                    <span className="truncate flex-1">{tag.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-4 bg-border mx-0.5" />

          <SimpleTooltip content={t('topBarTag.saveChanges')}>
            <button
              onClick={handleConfirm}
              className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-400 text-muted-foreground transition-colors outline-none shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </SimpleTooltip>

          <SimpleTooltip content={t('topBarTag.cancel')}>
            <button
              onClick={handleCancel}
              className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 text-muted-foreground transition-colors outline-none shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </SimpleTooltip>
        </div>
      )}
    </div>,
    container,
  );
};

export const TopBarTagFeature = () => {
  const showTopBarTag = useSettingsStore(
    (state) => state.enhancedFeatures.gemini.showTopBarTag,
  );
  const { url } = useUrl();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (!showTopBarTag) {
      setPortalTarget(null);
      return;
    }

    let observer: MutationObserver;

    const checkForContainer = () => {
      const parent = document.querySelector('top-bar-actions .center-section');
      if (parent) {
        let existingContainer = parent.querySelector(
          '#better-sidebar-top-bar-tag-container',
        ) as HTMLElement | null;
        if (existingContainer) {
          existingContainer.style.height = '100%';
          existingContainer.style.alignSelf = 'center';

          const shadow = existingContainer.shadowRoot;
          if (shadow) {
            const b = shadow.querySelector(
              '.shadow-body',
            ) as HTMLElement | null;
            if (b) {
              b.style.display = 'flex';
              b.style.alignItems = 'center';
              b.style.height = '100%';
              setPortalTarget(b);
              return;
            }
          }
        } else {
          const rootNode = document.createElement('div');
          rootNode.id = 'better-sidebar-top-bar-tag-container';

          rootNode.style.display = 'flex';
          rootNode.style.alignItems = 'center';
          rootNode.style.height = '100%';
          rootNode.style.alignSelf = 'center';

          // Insert right at the end of .center-section
          parent.appendChild(rootNode);

          const shadow = rootNode.attachShadow({ mode: 'open' });
          applyShadowStyles(shadow, mainStyles);

          const shadowBody = document.createElement('div');
          shadowBody.classList.add('shadow-body', 'theme-gemini');
          shadowBody.style.display = 'flex';
          shadowBody.style.alignItems = 'center';
          shadowBody.style.height = '100%';
          // Add standard theme classes
          if (
            document.body.classList.contains('dark-theme') ||
            document.body.getAttribute('data-theme') === 'dark'
          ) {
            shadowBody.classList.add('dark');
          }

          shadow.appendChild(shadowBody);
          setPortalTarget(shadowBody);
        }
      } else {
        setPortalTarget(null);
      }
    };

    checkForContainer();

    // Observe body for changes (useful when navigating between chats)
    observer = new MutationObserver(() => {
      checkForContainer();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [showTopBarTag, url]);

  if (!portalTarget || !showTopBarTag) return null;
  return <TopBarTagUI container={portalTarget} />;
};
