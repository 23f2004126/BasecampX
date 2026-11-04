/**
 * Packing checklist for a trek (GET /api/treks/<id>/checklist).
 * Ticks are a personal to-do list, so they're remembered in this browser
 * (localStorage, one key per trek) rather than on the server.
 */
import { get } from '../api.js';

const key = (trekId) => `tma.packing.${trekId}`;

export default {
  name: 'PackingChecklist',
  props: { trekId: { type: Number, required: true } },
  data: () => ({ loading: true, error: '', categories: [], packed: {} }),
  computed: {
    items() {
      return this.categories.flatMap((c) => c.items);
    },
    packedCount() {
      return this.items.filter((i) => this.packed[i.id]).length;
    },
  },
  async mounted() {
    try {
      this.packed = JSON.parse(localStorage.getItem(key(this.trekId))) || {};
    } catch {
      this.packed = {};
    }
    try {
      const data = await get(`/treks/${this.trekId}/checklist`);
      this.categories = data.categories;
    } catch (error) {
      this.error = error.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    toggle(id) {
      this.packed = { ...this.packed, [id]: !this.packed[id] };
      try {
        localStorage.setItem(key(this.trekId), JSON.stringify(this.packed));
      } catch {
        /* not remembered - fine */
      }
    },
  },
  template: `
    <div class="packing">
      <p v-if="loading" class="text-moss mb-0">Loading checklist…</p>
      <p v-else-if="error" class="text-moss mb-0">{{ error }}</p>
      <template v-else-if="items.length">
        <div class="packing__progress">
          <div class="progress flex-grow-1" role="progressbar" :aria-valuenow="packedCount" aria-valuemin="0" :aria-valuemax="items.length"
               aria-label="Items packed">
            <div class="progress-bar" :style="{ width: (packedCount / items.length * 100) + '%' }"></div>
          </div>
          <span class="small fw-semibold">{{ packedCount }} / {{ items.length }} packed</span>
        </div>
        <div class="packing__grid">
          <fieldset v-for="group in categories" :key="group.category" class="packing__group">
            <legend>{{ group.category }}</legend>
            <div v-for="item in group.items" :key="item.id" class="form-check">
              <input :id="'pack-' + item.id" class="form-check-input" type="checkbox" :checked="!!packed[item.id]" @change="toggle(item.id)">
              <label class="form-check-label" :for="'pack-' + item.id" :class="{ 'is-packed': packed[item.id] }">
                {{ item.item }}
                <span v-if="item.is_essential" class="packing__essential">Essential</span>
              </label>
            </div>
          </fieldset>
        </div>
      </template>
      <p v-else class="text-moss mb-0">No checklist for this trek yet.</p>
    </div>
  `,
};
