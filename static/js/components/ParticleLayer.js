/**
 * Soft floating light particles (fireflies / snow) on a full-screen <canvas>.
 *
 * How it works:
 * - One small glowing "sprite" is drawn once on an off-screen canvas.
 * - Each frame (requestAnimationFrame) every particle moves up a little,
 *   sways sideways on a sine wave and twinkles, then the sprite is stamped
 *   at its position. Particles leaving the top respawn at the bottom.
 * - Movement uses the real time between frames (dt), so speed is the same
 *   on 60Hz and 120Hz screens.
 * - The loop stops when the tab is hidden (saves battery) and the whole
 *   layer is skipped for prefers-reduced-motion.
 */
import { prefersReducedMotion } from '../utils/motion.js';

function makeSprite() {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size;
  const ctx = sprite.getContext('2d');
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255, 250, 235, 1)');
  glow.addColorStop(0.25, 'rgba(255, 244, 214, 0.55)');
  glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

export default {
  name: 'ParticleLayer',
  props: {
    count: { type: Number, default: 60 },
  },
  data() {
    return { enabled: !prefersReducedMotion() };
  },
  mounted() {
    if (!this.enabled) return;
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.sprite = makeSprite();

    this.onResize = () => this.resize();
    this.onVisibility = () => (document.hidden ? this.stop() : this.start());
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.resize();
    this.particles = Array.from({ length: this.count }, () => this.spawn(true));
    this.start();
  },
  beforeUnmount() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  },
  methods: {
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    /** A new particle. anywhere=true scatters it over the screen (first frame). */
    spawn(anywhere = false) {
      return {
        x: Math.random() * this.w,
        y: anywhere ? Math.random() * this.h : this.h + 10,
        r: 1 + Math.random() * 1.8,                 // radius in px
        speed: 0.012 + Math.random() * 0.03,        // px per ms upward
        sway: 6 + Math.random() * 14,               // sideways amplitude
        phase: Math.random() * Math.PI * 2,
        alpha: 0.18 + Math.random() * 0.35,         // low opacity
      };
    },
    start() {
      if (this.frame) return;
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    },
    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    },
    tick(now) {
      const dt = Math.min(now - this.last, 50); // clamp after tab switches
      this.last = now;
      const { ctx, sprite } = this;
      ctx.clearRect(0, 0, this.w, this.h);

      for (const p of this.particles) {
        p.y -= p.speed * dt;
        p.phase += dt * 0.0012;
        if (p.y < -12) Object.assign(p, this.spawn());

        const x = p.x + Math.sin(p.phase) * p.sway;
        const twinkle = 0.65 + 0.35 * Math.sin(p.phase * 2.3);
        const size = p.r * 8;
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.drawImage(sprite, x - size / 2, p.y - size / 2, size, size);
      }
      this.frame = requestAnimationFrame(this.tick);
    },
  },
  template: `<canvas v-if="enabled" ref="canvas" class="particle-layer" aria-hidden="true"></canvas>`,
};
