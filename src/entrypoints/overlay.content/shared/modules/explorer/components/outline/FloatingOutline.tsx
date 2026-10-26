import React, { useCallback, useRef, useState } from 'react';
import { CopyMinus, Crosshair, Pin, PinOff, X } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { FloatingPanel, type FloatingPanelRect } from '../../../../components/FloatingPanel';
import { OutlineContent, type OutlineContentHandle } from './OutlineContent';

/** First-time placement: a column along the right edge of the viewport. */
function defaultRect(): FloatingPanelRect {
  const width = 320;
  const height = Math.min(560, window.innerHeight - 160);
  return { x: window.innerWidth - width - 24, y: 96, width, height };
}

/**
 * The outline detached from the Explorer into a floating window.
 *
 * Mounted at OverlayPanel level (not inside ExplorerTab) so it survives tab
 * switches; the Explorer hides its own outline section while this is open.
 */
export const FloatingOutline: React.FC = () => {
  const { t } = useI18n();
  const open = useSettingsStore((s) => s.outlinePopout.open);
  const savedRect = useSettingsStore((s) => s.outlinePopout.rect);
  const setOpen = useSettingsStore((s) => s.setOutlinePopoutOpen);
  const setRect = useSettingsStore((s) => s.setOutlinePopoutRect);
  const pinned = useSettingsStore((s) => !!s.outlinePopout.pinned);
  const setPinned = useSettingsStore((s) => s.setOutlinePopoutPinned);
  const [fallbackRect] = useState(defaultRect);
  const outlineRef = useRef<OutlineContentHandle>(null);

  const handleLocate = useCallback(() => outlineRef.current?.scrollToActive(), []);
  const handleCollapseAll = useCallback(() => outlineRef.current?.collapseAll(), []);

  if (!open) return null;

  const iconBtn = 'h-6 w-6 text-muted-foreground hover:text-foreground';

  return (
    <FloatingPanel
      title={t('outline.title')}
      ariaLabel={t('outline.title')}
      rect={savedRect ?? fallbackRect}
      onRectCommit={setRect}
      autoDim={!pinned}
      actions={
        <>
          <SimpleTooltip content={pinned ? t('outline.unpinFade') : t('outline.pinFade')}>
            <Button
              variant="ghost"
              size="icon"
              className={iconBtn}
              onClick={() => setPinned(!pinned)}
              aria-pressed={pinned}
              aria-label={pinned ? t('outline.unpinFade') : t('outline.pinFade')}
            >
              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('menu.locateCurrent')}>
            <Button variant="ghost" size="icon" className={iconBtn} onClick={handleLocate}>
              <Crosshair className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button variant="ghost" size="icon" className={iconBtn} onClick={handleCollapseAll}>
              <CopyMinus className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('outline.dockBack')}>
            <Button
              variant="ghost"
              size="icon"
              className={iconBtn}
              onClick={() => setOpen(false)}
              aria-label={t('outline.dockBack')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
        </>
      }
    >
      <OutlineContent ref={outlineRef} />
    </FloatingPanel>
  );
};
