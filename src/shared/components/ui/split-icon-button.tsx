import React, { useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { Button, type ButtonProps } from './button';
import { SimpleTooltip } from './tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from './dropdown-menu';
import type { LucideIcon } from 'lucide-react';

export interface SplitDropdownItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  closeOnClick?: boolean;
}

interface SplitIconButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  disabled?: boolean;
  className?: string;
  dropdownItems?: SplitDropdownItem[];
}

export const SplitIconButton = ({
  icon,
  tooltip,
  onClick,
  variant = 'ghost',
  disabled,
  className,
  dropdownItems,
}: SplitIconButtonProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!dropdownItems || dropdownItems.length === 0) {
    return (
      <SimpleTooltip content={tooltip}>
        <Button
          variant={variant}
          size="icon"
          className={cn('h-7 w-7', className)}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </SimpleTooltip>
    );
  }

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <SimpleTooltip content={tooltip}>
        <Button
          variant={variant}
          size="icon"
          className={cn('h-7 w-7 pr-[3px]', className)}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </SimpleTooltip>

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute bottom-0 right-0 w-[9px] h-[9px] flex items-center justify-center cursor-pointer bg-transparent border-none p-0 outline-none"
            aria-label="More options"
          >
            <svg
              width="5"
              height="5"
              viewBox="0 0 5 5"
              className="text-muted-foreground"
            >
              <polygon points="5,0 5,5 0,5" fill="currentColor" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={4}
          className="bg-background border-border min-w-0 p-1"
        >
          <div className="flex flex-col items-center gap-0.5">
            {dropdownItems.map((item, i) => (
              <SimpleTooltip key={i} content={item.label}>
                <button
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-md text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    item.disabled && 'pointer-events-none opacity-50',
                  )}
                  onClick={(e) => {
                    if (item.closeOnClick) {
                      setDropdownOpen(false);
                    }
                    item.onClick();
                  }}
                  disabled={item.disabled}
                >
                  {item.icon && <item.icon className="h-4 w-4" />}
                </button>
              </SimpleTooltip>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
