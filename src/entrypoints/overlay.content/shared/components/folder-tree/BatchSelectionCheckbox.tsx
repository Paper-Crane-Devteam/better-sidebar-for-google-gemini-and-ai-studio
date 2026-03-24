import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { Check, Minus } from 'lucide-react';

interface BatchSelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  className?: string;
}

export const BatchSelectionCheckbox = ({
  checked,
  indeterminate,
  onChange,
  className,
}: BatchSelectionCheckboxProps) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center mr-2 cursor-pointer',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <div
        className={cn(
          'h-4 w-4 rounded border flex items-center justify-center transition-colors',
          checked || indeterminate
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground bg-transparent',
        )}
      >
        {checked && !indeterminate && <Check className="h-3 w-3" />}
        {indeterminate && <Minus className="h-3 w-3" />}
      </div>
    </div>
  );
};
