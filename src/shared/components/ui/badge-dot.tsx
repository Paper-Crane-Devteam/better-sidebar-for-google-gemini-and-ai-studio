import React from 'react';

interface BadgeDotProps {
  visible?: boolean;
  className?: string;
}

/**
 * A small red notification dot.
 * Use alongside buttons/tabs to indicate new features.
 */
export const BadgeDot = ({ visible = true, className = '' }: BadgeDotProps) => {
  if (!visible) return null;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full bg-red-500 shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
};
