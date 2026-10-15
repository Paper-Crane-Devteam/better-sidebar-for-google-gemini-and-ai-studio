/**
 * One-shot fireworks overlay, shown once when a pack is activated.
 *
 * Drawn on a single full-viewport canvas portalled to `document.body`, so it is not
 * clipped by the settings modal or the shadow root it lives in. The canvas ignores
 * pointer events, so the page stays usable while it plays. Users who ask the OS to
 * reduce motion get no animation at all; `onDone` fires straight away.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '@/shared/lib/z-index';

/** Colour sets per burst. Each burst picks one set so its sparks look related. */
const PALETTES = [
  ['#ffd166', '#ffb703', '#fff1c1'],
  ['#ff5d8f', '#ff99c8', '#ffe0ec'],
  ['#8b5cf6', '#c4b5fd', '#ede9fe'],
  ['#38bdf8', '#7dd3fc', '#e0f2fe'],
  ['#34d399', '#a7f3d0', '#ecfdf5'],
  ['#fb923c', '#fdba74', '#fff7ed'],
];

/** How many rockets to launch, and over how long. */
const ROCKET_COUNT = 8;
const LAUNCH_WINDOW_MS = 1800;
/** Hard stop, in case a frame stalls and particles never fade out. */
const MAX_DURATION_MS = 6000;

const GRAVITY = 0.06;
const FRICTION = 0.985;

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  palette: string[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function Fireworks({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest callback without restarting the animation when the parent re-renders.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (prefersReducedMotion()) {
      onDoneRef.current();
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      onDoneRef.current();
      return;
    }

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];

    const launch = (index: number) => {
      // Spread rockets across the screen; the first one goes near the middle.
      const x = index === 0 ? width / 2 : rand(width * 0.15, width * 0.85);
      const targetY = rand(height * 0.15, height * 0.45);
      rockets.push({
        x,
        y: height,
        vx: rand(-0.6, 0.6),
        // Enough speed to reach the target height against gravity.
        vy: -Math.sqrt(2 * GRAVITY * (height - targetY)) - rand(0.5, 1.5),
        targetY,
        palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      });
    };

    const explode = (r: Rocket) => {
      const count = Math.floor(rand(60, 90));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.05, 0.05);
        const speed = rand(1.5, 5);
        sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: rand(0.012, 0.022),
          size: rand(1.2, 2.4),
          color: r.palette[Math.floor(Math.random() * r.palette.length)],
        });
      }
    };

    const launchTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < ROCKET_COUNT; i++) {
      const delay = i === 0 ? 0 : rand(0, LAUNCH_WINDOW_MS);
      launchTimers.push(setTimeout(() => launch(i), delay));
    }

    const startedAt = performance.now();
    let frame = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      onDoneRef.current();
    };

    const tick = (now: number) => {
      // Fade the previous frame instead of clearing it, which leaves short trails
      // while keeping the canvas background transparent.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += GRAVITY;
        ctx.fillStyle = r.palette[2];
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
        ctx.fill();
        // Burst at the target height, or at the top of the arc if it falls short.
        if (r.y <= r.targetY || r.vy >= 0) {
          explode(r);
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= FRICTION;
        s.vy = s.vy * FRICTION + GRAVITY;
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= s.decay;
        if (s.alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const elapsed = now - startedAt;
      const allLaunched = elapsed > LAUNCH_WINDOW_MS;
      if ((allLaunched && rockets.length === 0 && sparks.length === 0) || elapsed > MAX_DURATION_MS) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      launchTimers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (typeof document === 'undefined' || prefersReducedMotion()) return null;

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: Z_INDEX.MAX,
      }}
    />,
    document.body,
  );
}
