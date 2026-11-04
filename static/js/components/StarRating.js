/**
 * Stars.
 *   Display: <StarRating :value="4.7" />            (fills fractional stars)
 *   Input:   <StarRating v-model="rating" editable />  (keyboard: arrows / 1-5)
 */
export default {
  name: 'StarRating',
  props: {
    value: { type: Number, default: 0 },
    modelValue: { type: Number, default: 0 },
    editable: { type: Boolean, default: false },
    label: { type: String, default: 'Rating' },
  },
  emits: ['update:modelValue'],
  data: () => ({ hover: 0 }),
  computed: {
    shown() {
      return this.editable ? (this.hover || this.modelValue) : this.value;
    },
  },
  methods: {
    fill(n) {
      return `${Math.round(Math.max(0, Math.min(1, this.shown - (n - 1))) * 100)}%`;
    },
    set(n) {
      this.$emit('update:modelValue', n);
    },
    onKey(e) {
      const v = this.modelValue || 0;
      if (['ArrowRight', 'ArrowUp'].includes(e.key)) this.set(Math.min(5, v + 1));
      else if (['ArrowLeft', 'ArrowDown'].includes(e.key)) this.set(Math.max(1, v - 1));
      else if (/^[1-5]$/.test(e.key)) this.set(Number(e.key));
      else return;
      e.preventDefault();
    },
  },
  template: `
    <span v-if="!editable" class="stars" role="img" :aria-label="value ? value + ' out of 5 stars' : 'Not rated yet'">
      <span v-for="n in 5" :key="n" class="stars__star" aria-hidden="true">
        <i class="bi bi-star-fill stars__bg"></i>
        <i class="bi bi-star-fill stars__fg" :style="{ width: fill(n) }"></i>
      </span>
    </span>
    <span v-else class="stars stars--input" role="slider" tabindex="0" :aria-label="label"
          aria-valuemin="1" aria-valuemax="5" :aria-valuenow="modelValue || 0"
          :aria-valuetext="(modelValue || 0) + ' of 5 stars'" @keydown="onKey" @mouseleave="hover = 0">
      <button v-for="n in 5" :key="n" type="button" class="stars__star" tabindex="-1"
              :aria-label="n + ' star' + (n > 1 ? 's' : '')" @mouseenter="hover = n" @click="set(n)">
        <i class="bi bi-star-fill stars__bg"></i>
        <i class="bi bi-star-fill stars__fg" :style="{ width: fill(n) }"></i>
      </button>
    </span>
  `,
};
