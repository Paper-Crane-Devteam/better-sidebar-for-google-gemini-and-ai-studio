import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { cn } from '@/shared/lib/utils/utils';

export interface UnifiedIconProps {
  /** Iconify icon name, e.g. "tabler:diamond", "tabler:notebook" */
  icon: string;
  /** Additional CSS classes (size, color, etc.) */
  className?: string;
  /** Inline style override */
  style?: React.CSSProperties;
  /** Explicit width (for icons that use pixel sizing instead of className) */
  width?: number | string;
  /** Explicit height (for icons that use pixel sizing instead of className) */
  height?: number | string;
}

/**
 * Unified icon component that wraps @iconify/react to match lucide-react's
 * visual appearance:
 * - Uses `currentColor` for stroke/fill (inherits text color like lucide)
 * - Renders at 1em × 1em by default (scales with font-size or explicit w/h classes)
 * - Applies `shrink-0` to prevent flex shrinking (same as lucide default behavior)
 *
 * Usage:
 *   <UIcon icon="tabler:diamond" className="h-4 w-4" />
 *   <UIcon icon="tabler:notebook" className="h-3.5 w-3.5" />
 *   <UIcon icon="fluent-color:premium-24" width={24} height={24} />
 *
 * NOTE: do not set `color: 'currentColor'` inline here. Iconify already emits
 * `fill="currentColor"` / `stroke="currentColor"` inside the SVG, so colour is
 * inherited without help. An inline `color` declaration outranks class rules and
 * would shadow `.sidebar-icon { color: rgb(var(--sidebar-icon-color)) }`, making
 * these icons fall back to the parent's colour (`--foreground`) while sibling
 * lucide icons correctly follow the theme's icon colour. That mismatch is
 * invisible on the default themes, where the two variables happen to be close,
 * and obvious on custom ones.
 */
export const UIcon = ({ icon, className, style, width, height }: UnifiedIconProps) => {
  return (
    <IconifyIcon
      icon={icon}
      className={cn('shrink-0', className)}
      {...(style !== undefined && { style })}
      {...(width !== undefined && { width })}
      {...(height !== undefined && { height })}
    />
  );
};
