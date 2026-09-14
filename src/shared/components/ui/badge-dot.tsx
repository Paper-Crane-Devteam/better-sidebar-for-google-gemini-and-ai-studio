import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { useBadge, useBadgeGroup } from '@/shared/lib/badge-store';

interface BadgeDotProps {
  visible?: boolean;
  className?: string;
}

/**
 * A small red notification dot. Purely presentational — pass `visible`
 * yourself, or use `FeatureBadge` / `BadgeLabel` to wire it to the badge store.
 */
export const BadgeDot = ({ visible = true, className = '' }: BadgeDotProps) => {
  if (!visible) return null;
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full bg-red-500 shrink-0', className)}
      aria-hidden="true"
    />
  );
};

/**
 * Where the dot sits relative to its anchor. The anchor must be `relative`.
 * - `icon`: inside an icon button, tucked into the top-right of the hit area
 * - `text`: hanging off the top-right of a text label
 * - `corner`: overhanging the anchor's corner, for tighter containers
 */
export type BadgePlacement = 'icon' | 'text' | 'corner' | 'inline';

const PLACEMENT: Record<BadgePlacement, string> = {
  icon: 'absolute top-1.5 right-1.5',
  text: 'absolute -top-1 -right-2.5',
  corner: 'absolute -top-0.5 -right-0.5',
  inline: '',
};

interface FeatureBadgeProps {
  /** Key from BADGE_REGISTRY. Unregistered keys render nothing. */
  badgeKey: string;
  /**
   * Show the dot when ANY badge under `badgeKey` (treated as a prefix) is
   * active, instead of matching the key exactly. For parent entry points.
   */
  group?: boolean;
  placement?: BadgePlacement;
  className?: string;
}

/**
 * A red dot bound to the badge store. Drop it inside any `relative` element:
 *
 *   <Button className="... relative">
 *     <Bot />
 *     <FeatureBadge badgeKey="tab.agent" />
 *   </Button>
 *
 * Dismissal stays with the caller, since only it knows what "the user acted on
 * this" means — see `useBadge`.
 */
export const FeatureBadge = ({
  badgeKey,
  group = false,
  placement = 'icon',
  className,
}: FeatureBadgeProps) => {
  const exact = useBadge(badgeKey).visible;
  const anyInGroup = useBadgeGroup(badgeKey);
  const visible = group ? anyInGroup : exact;
  return <BadgeDot visible={visible} className={cn(PLACEMENT[placement], className)} />;
};

interface BadgeLabelProps {
  badgeKey: string;
  group?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Text label with a dot hanging off its top-right corner. Brings its own
 * positioning context, so it works as-is inside menu items and nav buttons.
 */
export const BadgeLabel = ({ badgeKey, group, className, children }: BadgeLabelProps) => (
  <span className={cn('relative', className)}>
    {children}
    <FeatureBadge badgeKey={badgeKey} group={group} placement="text" />
  </span>
);
