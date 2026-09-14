import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { SimpleTooltip } from './tooltip';
import { cn } from '@/shared/lib/utils/utils';

export interface SplitNewChatItem {
  label: string;
  icon: React.ReactNode;
  tooltip?: string;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

interface SplitNewChatButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Middle-click (auxclick, button === 1) handler */
  onMiddleClick?: (e: React.MouseEvent) => void;
  tooltip?: string;
  dropdownItems?: SplitNewChatItem[];
  dropdownTooltip?: string;
  className?: string;
}

/**
 * A full-width CTA button with subtle background, border, and an optional
 * right-side dropdown arrow. The dropdown panel attaches directly below
 * with matching width, creating a unified "fused" appearance.
 */
export const SplitNewChatButton = ({
  icon,
  label,
  onClick,
  onContextMenu,
  onMiddleClick,
  tooltip,
  dropdownItems,
  dropdownTooltip,
  className,
}: SplitNewChatButtonProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  const hasDropdown = dropdownItems && dropdownItems.length > 0;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {/* Button row */}
      <div
        className={cn(
          'flex items-stretch rounded bg-primary/10 text-primary transition-all hover:bg-primary/20',
          open && 'rounded-b-none bg-primary/20',
        )}
      >
        {/* Main button */}
        <SimpleTooltip content={tooltip}>
          <button
            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-density font-medium text-primary hover:text-primary rounded-l transition-colors cursor-pointer border-none bg-transparent text-left"
            onClick={onClick}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                onContextMenu(e);
              }
            }}
            onMouseDown={(e) => {
              // Prevent middle-click autoscroll from kicking in
              if (onMiddleClick && e.button === 1) {
                e.preventDefault();
              }
            }}
            onAuxClick={(e) => {
              if (onMiddleClick && e.button === 1) {
                e.preventDefault();
                onMiddleClick(e);
              }
            }}
          >
            {icon}
            <span>{label}</span>
          </button>
        </SimpleTooltip>

        {/* Dropdown arrow */}
        {hasDropdown && (
          <>
            <div className="w-[1px] my-1 bg-primary/25" />
            <SimpleTooltip content={dropdownTooltip}>
              <button
                className={cn(
                  'flex items-center justify-center w-7 text-primary/80 hover:text-primary hover:bg-primary/15 rounded-r transition-colors cursor-pointer border-none bg-transparent',
                  open && 'text-primary bg-primary/15',
                )}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="true"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-180')} />
              </button>
            </SimpleTooltip>
          </>
        )}
      </div>

      {/* Dropdown panel — flush below, same width */}
      {open && hasDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 rounded-b bg-popover shadow-[shadow:var(--shadow-popover)] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
          {dropdownItems.map((item, i) => (
            <SimpleTooltip key={i} content={item.tooltip} side="left">
              <button
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-density font-medium text-foreground/80 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer border-none bg-transparent text-left',
                  i < dropdownItems.length - 1 && 'mb-1',
                )}
                onClick={(e) => {
                  item.onClick(e);
                  setOpen(false);
                }}
                onContextMenu={(e) => {
                  if (item.onContextMenu) {
                    item.onContextMenu(e);
                    setOpen(false);
                  }
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </SimpleTooltip>
          ))}
        </div>
      )}
    </div>
  );
};
