/**
 * Admin > Bookings: every booking incl. cancelled/completed history.
 *   GET /api/admin/bookings?status=&trek_id=&page=
 *   GET /api/admin/treks?per_page=100   (trek filter options)
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { prefs } from '../../store.js';
import { badgeClass, formatDate, formatMoney } from '../../utils/format.js';

export default {
  name: 'AllBookings',
  components: { Loader, EmptyState, Pagination },
  data() {
    return {
      statuses: ['Booked', 'Completed', 'Cancelled'],
      treks: [],
      status: '',
      trekId: String(this.$route.query.trek || ''),
      rows: [], page: 1, pages: 1, total: 0, loading: true,
    };
  },
  watch: {
    status() { this.load(1); },
    trekId() { this.load(1); },
  },
  mounted() {
    this.load();
    get('/admin/treks?per_page=100').then((d) => (this.treks = d.items)).catch(() => {});
  },
  methods: {
    badgeClass,
    formatDate,
    formatMoney,
    code: (id) => `B${String(id).padStart(3, '0')}`,
    async load(page = this.page) {
      this.loading = true;
      const params = new URLSearchParams({ page, per_page: prefs.perPage });
      if (this.status) params.set('status', this.status);
      if (this.trekId) params.set('trek_id', this.trekId);
      try {
        const data = await get(`/admin/bookings?${params}`);
        Object.assign(this, { rows: data.items, page: data.page, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">All Bookings</h1>
      <div class="filter-bar mb-3">
        <select v-model="status" class="form-select filter-bar__select" aria-label="Status">
          <option value="">Status: All</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="trekId" class="form-select filter-bar__select filter-bar__select--wide" aria-label="Trek">
          <option value="">Trek: All</option>
          <option v-for="t in treks" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
        </select>
      </div>

      <Loader v-if="loading" label="Loading bookings…" />
      <EmptyState v-else-if="!rows.length" title="No bookings match" message="Try another status or trek." />
      <template v-else>
        <div class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead><tr><th>Booking ID</th><th>User (Trekker)</th><th>Trek</th><th>Booking Date</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="(b, i) in rows" :key="b.id" class="stagger" :style="{ '--i': i }">
                <td data-label="Booking ID" class="text-moss">{{ code(b.id) }}</td>
                <td data-label="User (Trekker)" class="fw-semibold">{{ b.user_name }}</td>
                <td data-label="Trek">{{ b.trek_name }}</td>
                <td data-label="Booking Date">{{ formatDate(b.booking_date) }}</td>
                <td data-label="Amount">{{ formatMoney(b.amount) }}</td>
                <td data-label="Payment"><span :class="badgeClass(b.payment_status)">{{ b.payment_status }}</span></td>
                <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-moss small">{{ total }} booking{{ total === 1 ? '' : 's' }}</span>
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>
    </section>
  `,
};
