/**
 * Admin > Search: one box, tabs Users / Staff / Treks.
 *   GET /api/admin/search?q=&type=users|staff|treks
 */
import EmptyState from '../../components/EmptyState.js';
import Loader from '../../components/Loader.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { badgeClass } from '../../utils/format.js';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'staff', label: 'Staff' },
  { key: 'treks', label: 'Treks' },
];

export default {
  name: 'AdminSearch',
  components: { EmptyState, Loader },
  data() {
    const q = this.$route.query;
    return {
      tabs: TABS,
      tab: TABS.some((t) => t.key === q.type) ? q.type : 'users',
      q: typeof q.q === 'string' ? q.q : '',
      results: [],
      loading: false,
      searched: '',
    };
  },
  watch: {
    q() {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(this.run, 350);
    },
    tab() {
      this.run();
    },
  },
  mounted() {
    if (this.q) this.run();
    this.$refs.box.focus();
  },
  beforeUnmount() {
    clearTimeout(this.debounce);
  },
  methods: {
    badgeClass,
    async run() {
      const q = this.q.trim();
      this.$router.replace({ query: q ? { q, type: this.tab } : {} });
      if (!q) {
        this.results = [];
        this.searched = '';
        return;
      }
      this.loading = true;
      try {
        const data = await get(`/admin/search?q=${encodeURIComponent(q)}&type=${this.tab}`);
        this.results = data.results[this.tab] || [];
        this.searched = q;
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">Search</h1>
      <div class="input-icon mb-3">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input ref="box" v-model="q" type="search" class="form-control form-control-lg" placeholder="Search by name, email, phone, location…" aria-label="Search">
      </div>
      <div class="tabs" role="tablist" aria-label="Search in">
        <button v-for="t in tabs" :key="t.key" type="button" role="tab" class="tabs__tab"
                :class="{ 'is-active': tab === t.key }" :aria-selected="tab === t.key ? 'true' : 'false'" @click="tab = t.key">{{ t.label }}</button>
      </div>

      <Loader v-if="loading" label="Searching…" />
      <EmptyState v-else-if="!searched" title="Search the whole system" message="Find trekkers, staff or treks by name, email, phone or location." />
      <EmptyState v-else-if="!results.length" :title="'No ' + tab + ' match “' + searched + '”'" message="Try another word or tab." />

      <div v-else-if="tab === 'treks'" class="panel p-0 p-md-2">
        <table class="table table-theme table-hover table-stack">
          <thead><tr><th>Trek Name</th><th>Location</th><th>Difficulty</th><th>Slots</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="t in results" :key="t.id">
              <td data-label="Trek Name" class="fw-semibold">{{ t.name }}</td>
              <td data-label="Location">{{ t.location }}</td>
              <td data-label="Difficulty"><span :class="badgeClass(t.difficulty)">{{ t.difficulty }}</span></td>
              <td data-label="Slots">{{ t.available_slots }} / {{ t.total_slots }}</td>
              <td data-label="Status"><span :class="badgeClass(t.status)">{{ t.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="panel p-0 p-md-2">
        <table class="table table-theme table-hover table-stack">
          <thead><tr><th>Name</th><th>Email</th><th>Contact</th><th>{{ tab === 'staff' ? 'Treks led' : 'Bookings' }}</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="p in results" :key="p.id">
              <td data-label="Name" class="fw-semibold">{{ p.full_name }}</td>
              <td data-label="Email">{{ p.email }}</td>
              <td data-label="Contact">{{ p.contact_number }}</td>
              <td :data-label="tab === 'staff' ? 'Treks led' : 'Bookings'">{{ tab === 'staff' ? p.assigned_treks_count : p.bookings_count }}</td>
              <td data-label="Status"><span class="badge-soft" :class="p.is_blacklisted ? 'badge-blacklisted' : 'badge-active'">{{ p.is_blacklisted ? 'Blacklisted' : 'Active' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
};
