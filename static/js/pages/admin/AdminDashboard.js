/**
 * Admin dashboard (wireframe screen 3): GET /api/admin/stats
 * 4 stat cards + Recent Bookings (Booking ID, User (Trekker), Trek, Booking Date, Status).
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import StatCard from '../../components/StatCard.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { badgeClass, formatDate } from '../../utils/format.js';

export default {
  name: 'AdminDashboard',
  components: { Loader, EmptyState, StatCard },
  data: () => ({ loading: true, stats: null }),
  async mounted() {
    try {
      this.stats = await get('/admin/stats');
    } catch (error) {
      toast.error(error.message);
    } finally {
      this.loading = false;
    }
  },
  methods: {
    badgeClass,
    formatDate,
    code: (id) => `B${String(id).padStart(3, '0')}`,
  },
  template: `
    <section>
      <h1 class="page-title mb-4">Dashboard</h1>
      <Loader v-if="loading" label="Loading dashboard…" />
      <template v-else-if="stats">
        <div class="stat-grid mb-4">
          <StatCard class="stagger" style="--i: 0" label="Total Treks" :value="stats.total_treks" icon="bi-image-alt" />
          <StatCard class="stagger" style="--i: 1" label="Total Users (Trekkers)" :value="stats.total_users" icon="bi-people" />
          <StatCard class="stagger" style="--i: 2" label="Total Trekking Staff" :value="stats.total_staff" icon="bi-person-badge" />
          <StatCard class="stagger" style="--i: 3" label="Total Bookings" :value="stats.total_bookings" icon="bi-calendar-check" />
        </div>

        <h2 class="section-title">Recent Bookings</h2>
        <EmptyState v-if="!stats.recent_bookings.length" title="No bookings yet" />
        <div v-else class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead><tr><th>Booking ID</th><th>User (Trekker)</th><th>Trek</th><th>Booking Date</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="(b, i) in stats.recent_bookings" :key="b.id" class="stagger" :style="{ '--i': i }">
                <td data-label="Booking ID" class="text-moss">{{ code(b.id) }}</td>
                <td data-label="User (Trekker)" class="fw-semibold">{{ b.user_name }}</td>
                <td data-label="Trek">{{ b.trek_name }}</td>
                <td data-label="Booking Date">{{ formatDate(b.booking_date) }}</td>
                <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="text-end mt-2">
          <router-link to="/admin/bookings" class="fw-semibold">View All Bookings <i class="bi bi-arrow-right"></i></router-link>
        </div>
      </template>
    </section>
  `,
};
