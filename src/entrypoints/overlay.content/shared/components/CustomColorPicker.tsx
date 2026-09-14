import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import {
  clamp01,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  type HSV,
} from '@/shared/lib/utils/color';

interface CustomColorPickerProps {
  /** Current color; falls back to a neutral indigo when null/preset-less */
  value: string | null;
  /** Fired on every drag/valid hex input so the caller can live-preview */
  onChange: (hex: string) => void;
  className?: string;
}

const FALLBACK = '#6366F1';

/**
 * Saturation/Value square + hue slider + hex input.
 *
 * Pointer handling uses setPointerCapture so drags keep tracking even when the
 * pointer leaves the square or crosses the shadow-DOM boundary.
 */
export const CustomColorPicker = ({
  value,
  onChange,
  className,
}: CustomColorPickerProps) => {
  const { t } = useI18n();
  const [hsv, setHsv] = useState<HSV>(
    () => hexToHsv(value || FALLBACK) ?? { h: 239, s: 0.6, v: 0.95 },
  );
  const [hexDraft, setHexDraft] = useState(
    () => normalizeHex(value || FALLBACK) ?? FALLBACK,
  );
  const svRef = useRef<HTMLDivElement>(null);

  /**
   * Throttle the upward notification.
   *
   * `onChange` can be a persisted write (folder colors go through the
   * background worker and refetch the tree), so firing it on every pointermove
   * would flood it. Local state still updates immediately, keeping the picker
   * itself at full framerate, and a trailing call guarantees the final value
   * lands even if the drag ends between ticks.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const throttleRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pending: string | null;
  }>({ timer: null, pending: null });

  /** Colors this picker emitted, so the sync effect can ignore its own echoes */
  const emittedRef = useRef<Set<string>>(new Set());

  const notify = useCallback((hex: string) => {
    const state = throttleRef.current;
    // A long drag emits many values; only recent ones can still echo back.
    if (emittedRef.current.size > 64) emittedRef.current.clear();
    emittedRef.current.add(hex);
    if (state.timer) {
      state.pending = hex;
      return;
    }
    onChangeRef.current(hex);
    state.timer = setTimeout(() => {
      state.timer = null;
      const pending = state.pending;
      state.pending = null;
      if (pending) notify(pending);
    }, 120);
  }, []);

  // Flush a trailing value if the picker unmounts mid-throttle
  useEffect(
    () => () => {
      const state = throttleRef.current;
      if (state.timer) clearTimeout(state.timer);
      if (state.pending) onChangeRef.current(state.pending);
    },
    [],
  );

  /** Push a new HSV upward and keep the hex field in sync */
  const commitHsv = useCallback(
    (next: HSV) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexDraft(hex);
      notify(hex);
    },
    [notify],
  );

  /**
   * Follow external changes (e.g. a preset clicked while the picker is open).
   *
   * Values we emitted ourselves come back through `value` one throttle tick
   * late, so they are ignored: adopting them would snap the handle backwards
   * mid-drag.
   */
  useEffect(() => {
    const normalized = normalizeHex(value || '');
    if (!normalized) return;
    if (normalized === hsvToHex(hsv)) return;
    if (emittedRef.current.has(normalized)) return;
    const nextHsv = hexToHsv(normalized);
    if (!nextHsv) return;
    // Keep the current hue when the new color is achromatic, so the hue slider
    // does not jump to red when the user drags saturation down to zero.
    setHsv((prev) => (nextHsv.s === 0 ? { ...nextHsv, h: prev.h } : nextHsv));
    setHexDraft(normalized);
  }, [value]);

  const pickFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const s = clamp01((clientX - rect.left) / rect.width);
      const v = 1 - clamp01((clientY - rect.top) / rect.height);
      commitHsv({ h: hsv.h, s, v });
    },
    [commitHsv, hsv.h],
  );

  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pickFromEvent(e.clientX, e.clientY);
  };

  const handleSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    pickFromEvent(e.clientX, e.clientY);
  };

  const handleSvKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    commitHsv({
      h: hsv.h,
      s: clamp01(hsv.s + delta[0]),
      v: clamp01(hsv.v + delta[1]),
    });
  };

  const handleHexChange = (raw: string) => {
    setHexDraft(raw);
    const normalized = normalizeHex(raw);
    if (!normalized) return;
    const nextHsv = hexToHsv(normalized);
    if (nextHsv) setHsv(nextHsv.s === 0 ? { ...nextHsv, h: hsv.h } : nextHsv);
    notify(normalized);
  };

  const currentHex = hsvToHex(hsv);
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const isHexDraftValid = normalizeHex(hexDraft) !== null;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {/* Saturation / Value area */}
      {/*
        No ARIA role: there is no standard role for a 2-axis picker, and
        `slider` would require a single aria-valuenow. The hue slider and hex
        input below are the accessible paths to any color; this area stays
        keyboard-nudgeable as a convenience.
      */}
      <div
        ref={svRef}
        tabIndex={0}
        aria-label={t('folderSettings.customColorArea')}
        className="relative h-28 w-full rounded-md cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        style={{ backgroundColor: hueHex }}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        onKeyDown={handleSvKeyDown}
      >
        <div className="absolute inset-0 rounded-md bg-[linear-gradient(to_right,#fff,transparent)]" />
        <div className="absolute inset-0 rounded-md bg-[linear-gradient(to_top,#000,transparent)]" />
        <div
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Hue slider */}
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label={t('folderSettings.customColorHue')}
        className="h-3 w-full appearance-none rounded-full outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)] [&::-webkit-slider-thumb]:bg-transparent"
        style={{
          background:
            'linear-gradient(to right,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => commitHsv({ ...hsv, h: Number(e.target.value) })}
      />

      {/* Hex input + swatch */}
      <div className="flex items-center gap-2">
        <span
          className="h-7 w-7 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: currentHex }}
        />
        <input
          type="text"
          value={hexDraft}
          spellCheck={false}
          aria-label={t('folderSettings.customColorHex')}
          placeholder="#6366F1"
          className={cn(
            'min-w-0 flex-1 rounded-md border bg-background px-2 py-1 font-mono text-xs uppercase text-foreground outline-none focus:ring-2 focus:ring-primary/50',
            isHexDraftValid ? 'border-border' : 'border-destructive',
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => handleHexChange(e.target.value)}
          onBlur={() => setHexDraft(currentHex)}
        />
      </div>
    </div>
  );
};
