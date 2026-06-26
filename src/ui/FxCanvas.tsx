import { useEffect, useRef } from "react";
import { _fxState, _onFxWake } from "./fx";

/**
 * The juice renderer — a single full-screen, pointer-transparent canvas that draws
 * the fx particles + floating texts. The rAF loop sleeps when there's nothing to
 * draw (zero battery cost at idle) and is woken by fx.burst()/floatText(). Honors
 * reduced-motion by skipping the draw entirely.
 */
export function FxCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const running = useRef(false);
  const last = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const { particles, floaters } = _fxState();

    const frame = (t: number) => {
      const dt = last.current ? Math.min(50, t - last.current) : 16;
      last.current = t;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life += dt;
        if (p.life >= p.max) { particles.splice(i, 1); continue; }
        p.vy += p.grav * (dt / 16);
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = "center";
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i]!;
        f.life += dt;
        if (f.life >= f.max) { floaters.splice(i, 1); continue; }
        const prog = f.life / f.max;
        f.y += f.vy * (dt / 16) * (1 - prog * 0.5);
        ctx.globalAlpha = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;
        ctx.fillStyle = f.color;
        ctx.font = `800 ${f.size}px ui-rounded, system-ui, sans-serif`;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      if (particles.length === 0 && floaters.length === 0) {
        running.current = false; // sleep until the next burst
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running.current) return;
      running.current = true;
      last.current = 0;
      raf = requestAnimationFrame(frame);
    };
    const off = _onFxWake(start);

    return () => { off(); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); running.current = false; };
  }, [reducedMotion]);

  if (reducedMotion) return null;
  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" />;
}
