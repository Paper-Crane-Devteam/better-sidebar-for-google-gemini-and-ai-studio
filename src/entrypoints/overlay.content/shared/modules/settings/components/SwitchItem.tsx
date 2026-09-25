import React from 'react';
import { Switch } from '@/shared/components/ui/switch';

interface SwitchItemProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}

/**
 * Reusable switch setting row with hover background.
 * Use for all toggle-type settings across the settings panel.
 */
export const SwitchItem: React.FC<SwitchItemProps> = ({
  label,
  description,
  checked,
  onCheckedChange,
  children,
}) => {
  return (
    <div className="flex items-start justify-between py-2 px-2 rounded hover:bg-accent/30 group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {children}
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
};
