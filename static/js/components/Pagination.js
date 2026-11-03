/**
 * ‹ 1 2 3 › pager (wireframe screens 4 and 11).
 * <Pagination :page="page" :pages="pages" @change="goTo" />
 * Shows at most 5 page numbers around the current page.
 */
export default {
  name: 'Pagination',
  props: {
    page: { type: Number, required: true },
    pages: { type: Number, required: true },
  },
  emits: ['change'],
  computed: {
    numbers() {
      const span = 5;
      let start = Math.max(1, this.page - Math.floor(span / 2));
      const end = Math.min(this.pages, start + span - 1);
      start = Math.max(1, end - span + 1);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    },
  },
  methods: {
    go(n) {
      if (n >= 1 && n <= this.pages && n !== this.page) this.$emit('change', n);
    },
  },
  template: `
    <nav v-if="pages > 1" class="pager" aria-label="Pagination">
      <button type="button" class="pager__btn" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)">
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        v-for="n in numbers"
        :key="n"
        type="button"
        class="pager__btn"
        :class="{ 'is-current': n === page }"
        :aria-current="n === page ? 'page' : null"
        @click="go(n)"
      >{{ n }}</button>
      <button type="button" class="pager__btn" :disabled="page >= pages" aria-label="Next page" @click="go(page + 1)">
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </nav>
  `,
};
