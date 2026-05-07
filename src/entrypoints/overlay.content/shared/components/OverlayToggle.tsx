import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layout } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';

interface OverlayToggleProps {
  onToggle: () => void;
}

const BUTTON_SIZE = 44;

export const OverlayToggle = ({ onToggle }: OverlayToggleProps) => {
  const { t } = useI18n();
  const { overlayPosition, setOverlayPosition, theme } = useSettingsStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const checkDark = () => {
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    };
    setIsDark(checkDark());

    if (theme === 'system') {
      const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const clamp = useCallback((pos: { x: number; y: number }) => {
    const maxX = window.innerWidth - BUTTON_SIZE;
    const maxY = window.innerHeight - BUTTON_SIZE;
    return {
      x: Math.max(0, Math.min(pos.x, maxX)),
      y: Math.max(0, Math.min(pos.y, maxY)),
    };
  }, []);

  // Position: overlayPosition stores {x, y} as offset from left/bottom
  const pos = clamp(overlayPosition);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    setIsDragging(true);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    if (dragRef.current.moved) {
      const newPos = clamp({
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY - dy, // y is from bottom, so invert
      });
      setOverlayPosition(newPos);
    }
  }, [clamp, setOverlayPosition]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const wasDrag = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setIsDragging(false);
    if (!wasDrag) {
      onToggle();
    }
  }, [onToggle]);

  const buttonStyle: React.CSSProperties = {
    width: `${BUTTON_SIZE}px`,
    height: `${BUTTON_SIZE}px`,
    borderRadius: '50%',
    backgroundColor: isDark ? '#27272a' : '#ffffff',
    border: isDark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
    color: isDark ? '#f4f4f5' : '#18181b',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: isDragging ? 'grabbing' : 'grab',
    transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s',
    transform: isHovered && !isDragging ? 'scale(1.1)' : 'scale(1)',
    outline: 'none',
    padding: 0,
    touchAction: 'none',
    userSelect: 'none',
  };

  const tooltipSide = pos.x > window.innerWidth / 2 ? 'left' : 'right';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: `${pos.x}px`,
        bottom: `${pos.y}px`,
      }}
    >
      <SimpleTooltip content={t('overlay.showSidepanel')} side={tooltipSide as any}>
        <button
          style={buttonStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => { setIsHovered(false); }}
          aria-label={t('overlay.showSidepanel')}
        >
          <Layout style={{ width: '20px', height: '20px', pointerEvents: 'none' }} />
        </button>
      </SimpleTooltip>
    </div>,
    document.body
  );
};
