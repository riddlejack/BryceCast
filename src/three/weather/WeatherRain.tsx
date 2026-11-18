import { useEffect, useRef } from 'react';

/* Fine rain over a 3D model or one of its stills: short grey streaks falling,
 * drifting with the wind across the picture (career round 2, Nov 17 2026).
 * A 2D canvas laid over the picture, so the rain costs the model no WebGL
 * frame. It runs only while on screen; with reduced motion it is one still
 * frame of streaks. */

interface Drop { x: number; y: number; len: number; speed: number; alpha: number }

export const WeatherRain = ({
  intensity,
  drift = () => 0,
  reduced = false,
  scale = 1,
  density = 1,
  className = 'wx-rain'
}: {
  /** 0..1: how hard it rains (drizzle about 0.3, moderate rain 0.6). */
  intensity: number;
  /** Sideways drift per unit fall (-1..1): the wind on screen, read every frame (the camera turns). */
  drift?: () => number;
  reduced?: boolean;
  /** Streak size against a full-size stage (a small still: about 0.6). */
  scale?: number;
  /** Streaks per area against the full-size stage (a small still: about 2, so a card's few square inches still read as rain). */
  density?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const driftRef = useRef(drift);
  driftRef.current = drift;

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || intensity <= 0) return undefined;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let drops: Drop[] = [];
    let raf = 0;
    let last = 0;
    let onScreen = true;
    const seed = (fromTop: boolean): Drop => ({
      x: Math.random() * (W + 120) - 60,
      y: fromTop ? -Math.random() * 40 : Math.random() * H,
      len: (7 + Math.random() * (6 + 9 * intensity)) * scale,
      speed: (0.55 + Math.random() * 0.35 + intensity * 0.55) * Math.max(0.6, scale),
      // a small still's streaks are fewer pixels: darker, so they still read as rain
      alpha: (0.13 + Math.random() * 0.1 + intensity * 0.12) * (scale < 1 ? 1 + (1 - scale) * 1.6 : 1)
    });
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      const count = Math.round(((W * H) / (1600 * scale * scale)) * (0.25 + intensity * 0.75) * density);
      drops = Array.from({ length: Math.min(900, count) }, () => seed(false));
    };
    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const d = Math.max(-0.7, Math.min(0.7, driftRef.current()));
      g.lineCap = 'round';
      g.lineWidth = Math.max(0.7, 0.9 * scale);
      for (const drop of drops) {
        g.strokeStyle = `rgba(78, 90, 104, ${drop.alpha.toFixed(3)})`;
        g.beginPath();
        g.moveTo(drop.x, drop.y);
        g.lineTo(drop.x - d * drop.len, drop.y - drop.len);
        g.stroke();
      }
    };
    const step = (now: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      const d = Math.max(-0.7, Math.min(0.7, driftRef.current()));
      for (let i = 0; i < drops.length; i += 1) {
        const drop = drops[i];
        drop.y += drop.speed * dt;
        drop.x += drop.speed * dt * d;
        if (drop.y - drop.len > H || drop.x < -80 || drop.x > W + 80) drops[i] = seed(true);
      }
      draw();
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (reduced || raf || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(step);
    };
    size();
    draw();
    const resize = new ResizeObserver(() => {
      size();
      draw();
    });
    resize.observe(canvas);
    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      start();
    });
    seen.observe(canvas);
    const vis = () => start();
    document.addEventListener('visibilitychange', vis);
    start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intensity, reduced, scale, density]);

  if (intensity <= 0) return null;
  return <canvas ref={ref} className={className} aria-hidden />;
};
