/**
 * Dashboard number tile (wireframe screens 3 and 8): label, big number that
 * counts up from 0, and an icon. <StatCard label="Total Treks" :value="25" icon="bi-image-alt" />
 */
import { prefersReducedMotion } from '../utils/motion.js';

export default {
  name: 'StatCard',
  props: {
    label: { type: String, required: true },
    value: { type: Number, default: 0 },
    icon: { type: String, default: 'bi-graph-up' },
  },
  data: () => ({ shown: 0 }),
  watch: {
    value: { immediate: true, handler: 'countUp' },
  },
  beforeUnmount() {
    cancelAnimationFrame(this.frame);
  },
  methods: {
    countUp(target) {
      cancelAnimationFrame(this.frame);
      if (prefersReducedMotion()) {
        this.shown = target;
        return;
      }
      const from = this.shown;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 900);
        const eased = 1 - (1 - t) ** 3; // ease-out
        this.shown = Math.round(from + (target - from) * eased);
        if (t < 1) this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    },
  },
  template: `
    <div class="stat-card">
      <div>
        <p class="stat-card__label">{{ label }}</p>
        <p class="stat-card__value" :aria-label="value">{{ shown.toLocaleString('en-IN') }}</p>
      </div>
      <span class="stat-card__icon" aria-hidden="true"><i class="bi" :class="icon"></i></span>
    </div>
  `,
};
