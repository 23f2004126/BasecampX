/**
 * Wraps any content and tilts it in 3D towards the mouse, with a light glare
 * that follows the cursor.
 *
 * How it works:
 * - On pointermove we find where the cursor is inside the card as 0..1 (px, py).
 * - That becomes rotateY (left/right) and rotateX (up/down), at most `max` degrees:
 *     rotateY = (px - 0.5) * 2 * max     rotateX = -(py - 0.5) * 2 * max
 * - perspective(900px) in the same transform makes the near edge look bigger.
 * - The glare is a radial gradient whose centre (--gx, --gy) is the cursor position.
 * - Updates are batched with requestAnimationFrame (max once per frame).
 * - Disabled on touch devices (no hover) and for prefers-reduced-motion.
 */
import { canHover, prefersReducedMotion } from '../utils/motion.js';

export default {
  name: 'TiltCard',
  props: {
    max: { type: Number, default: 8 }, // degrees
  },
  data() {
    return { enabled: false, active: false, rx: 0, ry: 0, gx: 50, gy: 50 };
  },
  computed: {
    innerStyle() {
      return {
        transform: `perspective(900px) rotateX(${this.rx}deg) rotateY(${this.ry}deg)`,
        '--gx': `${this.gx}%`,
        '--gy': `${this.gy}%`,
      };
    },
  },
  mounted() {
    this.enabled = canHover() && !prefersReducedMotion();
  },
  beforeUnmount() {
    cancelAnimationFrame(this.frame);
  },
  methods: {
    onMove(event) {
      if (!this.enabled || event.pointerType === 'touch') return;
      this.pointer = { x: event.clientX, y: event.clientY };
      if (!this.frame) this.frame = requestAnimationFrame(this.apply);
    },
    apply() {
      this.frame = null;
      const rect = this.$el.getBoundingClientRect();
      const px = Math.min(Math.max((this.pointer.x - rect.left) / rect.width, 0), 1);
      const py = Math.min(Math.max((this.pointer.y - rect.top) / rect.height, 0), 1);
      this.ry = +((px - 0.5) * 2 * this.max).toFixed(2);
      this.rx = +(-(py - 0.5) * 2 * this.max).toFixed(2);
      this.gx = Math.round(px * 100);
      this.gy = Math.round(py * 100);
      this.active = true;
    },
    reset() {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.rx = this.ry = 0;
      this.active = false;
    },
  },
  template: `
    <div class="tilt" @pointermove="onMove" @pointerleave="reset">
      <div class="tilt__inner" :class="{ 'is-active': active }" :style="enabled ? innerStyle : null">
        <slot></slot>
        <span v-if="enabled" class="tilt__glare" aria-hidden="true"></span>
      </div>
    </div>
  `,
};
