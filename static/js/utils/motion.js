/**
 * Small motion helpers shared by components.
 * Every effect checks prefersReducedMotion() first and degrades gracefully.
 */

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True for a real mouse/trackpad. False on phones/tablets (no hover effects there). */
export const canHover = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Type `text` one character at a time, calling onUpdate(partialText).
 * Returns a cancel() function (call it when the component unmounts).
 */
export function typewriter(text, onUpdate, { speed = 45, startDelay = 300 } = {}) {
  if (prefersReducedMotion()) {
    onUpdate(text);
    return () => {};
  }
  let i = 0;
  let timer = setTimeout(function tick() {
    i += 1;
    onUpdate(text.slice(0, i));
    if (i < text.length) timer = setTimeout(tick, speed);
  }, startDelay);
  return () => clearTimeout(timer);
}

/** Material-style ripple from the click point. The element needs class "has-ripple". */
export function addRipple(event) {
  if (prefersReducedMotion()) return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${event.clientX - rect.left - size / 2}px`;
  dot.style.top = `${event.clientY - rect.top - size / 2}px`;
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove());
}

const CONFETTI_COLOURS = ['#f28c28', '#4ca0b4', '#cecbb4', '#a0c3be', '#9a7461', '#e7e9db'];

/**
 * A short confetti burst from screen point (x, y), drawn on a temporary canvas.
 * Resolves when the animation is over (~1.1s), so callers can `await` it.
 */
export function confettiBurst(x, y, { count = 90, duration = 1100 } = {}) {
  if (prefersReducedMotion()) return Promise.resolve();

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Each piece gets a random upward velocity, spin and colour.
  const pieces = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 6 + Math.random() * 8;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      colour: CONFETTI_COLOURS[(Math.random() * CONFETTI_COLOURS.length) | 0],
    };
  });

  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now) {
      const t = (now - start) / duration;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - t * t); // fade out towards the end
      for (const p of pieces) {
        p.vy += 0.35;   // gravity
        p.vx *= 0.985;  // air drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}
