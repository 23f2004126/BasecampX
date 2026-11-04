/**
 * Staff > My Treks: all assigned treks with search + status filter.
 *   GET /api/staff/treks?search=&status=&page=
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import StaffTrekTable from '../../components/StaffTrekTable.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { prefs } from '../../store.js';
import { TREK_STATUSES } from '../../utils/constants.js';

export default {
  name: 'StaffMyTreks',
  components: { Loader, EmptyState, Pagination, StaffTrekTable },
  data: () => ({ statuses: TREK_STATUSES, search: '', status: '', treks: [], page: 1, pages: 1, loading: true }),
  watch: {
    search() {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.load(1), 350);
    },
    status() { this.load(1); },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    clearTimeout(this.debounce);
  },
  methods: {
    async load(page = this.page) {
      this.loading = true;
      const params = new URLSearchParams({ page, per_page: prefs.perPage });
      if (this.search.trim()) params.set('search', this.search.trim());
      if (this.status) params.set('status', this.status);
      try {
        const data = await get(`/staff/treks?${params}`);
        Object.assign(this, { treks: data.items, page: data.page, pages: data.pages });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">My Treks</h1>
      <div class="filter-bar mb-3">
        <div class="input-icon flex-grow-1">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input v-model="search" type="search" class="form-control" placeholder="Search my treks…" aria-label="Search my treks">
        </div>
        <select v-model="status" class="form-select filter-bar__select" aria-label="Status">
          <option value="">Status: All</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <Loader v-if="loading" label="Loading your treks…" />
      <EmptyState v-else-if="!treks.length" :title="search || status ? 'No treks match' : 'No treks assigned yet'"
                  :message="search || status ? 'Try another search or status.' : 'The admin will assign treks to you.'" />
      <template v-else>
        <StaffTrekTable :treks="treks" />
        <div class="d-flex justify-content-end mt-3"><Pagination :page="page" :pages="pages" @change="load" /></div>
      </template>
    </section>
  `,
};
