import React, { useState, useCallback, useRef } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { OutlineContent, OutlineContentHandle } from './outline/OutlineContent';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { CopyMinus, Crosshair, PictureInPicture2 } from 'lucide-react';
import { CollapsibleSection } from '../../../components/CollapsibleSection';

interface OutlineSectionProps {
  /** When true, the section fills all available vertical space (e.g. when Chats is collapsed) */
  fillAvailable?: boolean;
}

/**
 * Collapsible outline section at the bottom of the Explorer.
 * Uses the shared CollapsibleSection component with resize support.
 */
export const OutlineSection: React.FC<OutlineSectionProps> = ({ fillAvailable = false }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const { outlineHeight, setOutlineHeight } = useSettingsStore();
  const isPoppedOut = useSettingsStore((s) => s.outlinePopout.open);
  const setPopoutOpen = useSettingsStore((s) => s.setOutlinePopoutOpen);
  const outlineRef = useRef<OutlineContentHandle>(null);

  const handleLocateCurrent = useCallback(() => {
    outlineRef.current?.scrollToActive();
  }, []);

  const handleCollapseAll = useCallback(() => {
    outlineRef.current?.collapseAll();
  }, []);

  // Rendered by <FloatingOutline /> at the panel level while detached.
  if (isPoppedOut) return null;

  return (
    <CollapsibleSection
      title={t('outline.title')}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      fillAvailable={fillAvailable}
      resizable
      height={outlineHeight}
      onHeightChange={setOutlineHeight}
      actions={
        <>
          <SimpleTooltip content={t('outline.popOut')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={() => setPopoutOpen(true)}
              aria-label={t('outline.popOut')}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('menu.locateCurrent')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={handleLocateCurrent}
            >
              <Crosshair className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={handleCollapseAll}
            >
              <CopyMinus className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
        </>
      }
    >
      <OutlineContent ref={outlineRef} />
    </CollapsibleSection>
  );
};
