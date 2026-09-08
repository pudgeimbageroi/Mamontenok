/**
 * Конфетти при создании сделки.
 *
 * Без библиотеки: канвас на весь экран, живёт полторы секунды и сам себя
 * убирает. Уважает prefers-reduced-motion — если система просит не
 * анимировать, просто ничего не делаем.
 */

const COLORS = ["#0883FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

type Piece = {
  x: number; y: number;
  vx: number; vy: number;
  size: number; color: string;
  rot: number; vr: number;
  life: number;
};

export function fireConfetti(count = 90) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  // Два источника по нижним углам — так лента накрывает середину экрана
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 45;
    const speed = 13 + Math.random() * 11;
    const rad = (angle * Math.PI) / 180;
    pieces.push({
      x: fromLeft ? 0 : W,
      y: H,
      vx: Math.cos(rad) * speed * (fromLeft ? 1 : -1),
      vy: Math.sin(rad) * speed,
      size: 5 + Math.random() * 6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    });
  }

  const GRAVITY = 0.32;
  const DRAG = 0.992;
  let raf = 0;

  function frame() {
    ctx!.clearRect(0, 0, W, H);
    let alive = 0;

    for (const p of pieces) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.011;

      if (p.life <= 0 || p.y > H + 60) continue;
      alive++;

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx!.fillStyle = p.color;
      // Прямоугольники крутятся живее квадратов
      ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx!.restore();
    }

    if (alive > 0) raf = requestAnimationFrame(frame);
    else { cancelAnimationFrame(raf); canvas.remove(); }
  }

  raf = requestAnimationFrame(frame);
  // Страховка: даже если что-то пойдёт не так, канвас уберётся
  setTimeout(() => { cancelAnimationFrame(raf); canvas.remove(); }, 4000);
}
