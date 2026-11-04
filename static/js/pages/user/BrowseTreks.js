/**
 * Browse Treks (wireframe screen 11).
 * Every filter is sent to GET /api/treks as a query parameter:
 *   search, difficulty, location, min_days, max_days, sort (date|rating), page, per_page
 * Filters live in the URL too (?search=kedar&page=2), so refresh/back keep them.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import TrekCard from '../../components/TrekCard.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { DURATIONS, TREK_DIFFICULTIES } from '../../utils/constants.js';
import { refreshMyTreks } from '../../utils/waitlist.js';

const PER_PAGE = 9; // 3 x 3 grid
const FILTERS = ['search', 'difficulty', 'location', 'duration', 'sort'];

export default {
  name: 'BrowseTreks',
  components: { Loader, EmptyState, Pagination, TrekCard },
  data() {
    const q = this.$route.query;
    return {
      difficulties: TREK_DIFFICULTIES,
      durations: DURATIONS,
      locations: [],
      filters: Object.fromEntries(FILTERS.map((f) => [f, typeof q[f] === 'string' ? q[f] : ''])),
      page: Number(q.page) || 1,
      treks: [],
      pages: 1,
      total: 0,
      loading: true,
    };
  },
  computed: {
    hasFilters() {
      return FILTERS.some((f) => this.filters[f] && !(f === 'sort' && this.filters[f] === 'date'));
    },
  },
  watch: {
    'filters.search'() {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.apply(), 350); // wait until typing pauses
    },
    'filters.difficulty': 'apply',
    'filters.location': 'apply',
    'filters.duration': 'apply',
    'filters.sort': 'apply',
  },
  mounted() {
    this.load();
    refreshMyTreks();
    get('/treks/locations').then((d) => (this.locations = d.locations)).catch(() => {});
  },
  beforeUnmount() {
    clearTimeout(this.debounce);
    clearTimeout(this.applyTimer);
  },
  methods: {
    apply() {
      // several filters can change at once (Clear filters): send one request
      this.page = 1;
      clearTimeout(this.applyTimer);
      this.applyTimer = setTimeout(this.load, 0);
    },
    goTo(page) {
      this.page = page;
      this.load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    clear() {
      Object.assign(this.filters, { search: '', difficulty: '', location: '', duration: '', sort: '' });
    },
    async load() {
      this.loading = true;
      const params = new URLSearchParams({ page: this.page, per_page: PER_PAGE });
      const f = this.filters;
      if (f.search.trim()) params.set('search', f.search.trim());
      if (f.difficulty) params.set('difficulty', f.difficulty);
      if (f.location) params.set('location', f.location);
      const range = DURATIONS.find((d) => d.value === f.duration);
      if (range?.min) params.set('min_days', range.min);
      if (range?.max) params.set('max_days', range.max);
      if (f.sort === 'rating') params.set('sort', 'rating');

      // keep the URL in sync (without adding history entries)
      const query = Object.fromEntries(Object.entries({ ...f, page: this.page > 1 ? String(this.page) : '' }).filter(([, v]) => v));
      this.$router.replace({ query });

      try {
        const data = await get(`/treks?${params}`);
        Object.assign(this, { treks: data.items, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <section>
      <div class="filter-bar mb-4">
        <div class="input-icon flex-grow-1">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input v-model="filters.search" type="search" class="form-control" placeholder="Search treks…" aria-label="Search treks">
        </div>
        <select v-model="filters.difficulty" class="form-select filter-bar__select" aria-label="Difficulty">
          <option value="">Difficulty: All</option>
          <option v-for="d in difficulties" :key="d" :value="d">{{ d }}</option>
        </select>
        <select v-model="filters.location" class="form-select filter-bar__select" aria-label="Location">
          <option value="">Location: All</option>
          <option v-for="l in locations" :key="l" :value="l">{{ l }}</option>
        </select>
        <select v-model="filters.duration" class="form-select filter-bar__select" aria-label="Duration">
          <option v-for="d in durations" :key="d.value" :value="d.value">{{ d.label }}</option>
        </select>
        <select v-model="filters.sort" class="form-select filter-bar__select" aria-label="Sort by">
          <option value="">Sort: Start date</option>
          <option value="rating">Sort: Top rated</option>
        </select>
      </div>

      <Loader v-if="loading" label="Finding treks…" />
      <EmptyState v-else-if="!treks.length" title="No treks match your filters"
                  message="Try a different search, or clear the filters to see every open trek."
                  :action-label="hasFilters ? 'Clear filters' : ''" @action="clear" />
      <template v-else>
        <p class="text-moss small mb-3">{{ total }} trek{{ total === 1 ? '' : 's' }}</p>
        <div class="trek-grid">
          <TrekCard v-for="(t, i) in treks" :key="t.id" :trek="t" action="details" class="stagger" :style="{ '--i': i }" />
        </div>
        <div class="d-flex justify-content-center mt-4">
          <Pagination :page="page" :pages="pages" @change="goTo" />
        </div>
      </template>
    </section>
  `,
};
