/**
 * Staff > My Dashboard (wireframe screen 8).
 *   GET /api/staff/dashboard            3 stat cards
 *   GET /api/staff/treks?per_page=5     My Assigned Treks
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import StatCard from '../../components/StatCard.js';
import StaffTrekTable from '../../components/StaffTrekTable.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';

export default {
  name: 'StaffDashboard',
  components: { Loader, EmptyState, StatCard, StaffTrekTable },
  data: () => ({ loading: true, stats: null, treks: [], total: 0 }),
  async mounted() {
    try {
      const [stats, treks] = await Promise.all([get('/staff/dashboard'), get('/staff/treks?per_page=5')]);
      Object.assign(this, { stats, treks: treks.items, total: treks.total });
    } catch (error) {
      toast.error(error.message);
    } finally {
      this.loading = false;
    }
  },
  template: `
    <section>
      <h1 class="page-title mb-4">My Dashboard</h1>
      <Loader v-if="loading" label="Loading your treks…" />
      <template v-else-if="stats">
        <div class="stat-grid stat-grid--3 mb-4">
          <StatCard class="stagger" style="--i: 0" label="Assigned Treks" :value="stats.assigned_treks_count" icon="bi-calendar-event" />
          <StatCard class="stagger" style="--i: 1" label="Total Participants" :value="stats.total_participants" icon="bi-people" />
          <StatCard class="stagger" style="--i: 2" label="Ongoing Treks" :value="stats.ongoing_treks_count" icon="bi-image-alt" />
        </div>

        <h2 class="section-title">My Assigned Treks</h2>
        <EmptyState v-if="!treks.length" title="No treks assigned yet" message="The admin will assign treks to you." />
        <template v-else>
          <StaffTrekTable :treks="treks" />
          <div v-if="total > treks.length" class="text-end mt-2">
            <router-link to="/staff/treks" class="fw-semibold">View all {{ total }} treks <i class="bi bi-arrow-right"></i></router-link>
          </div>
        </template>
      </template>
    </section>
  `,
};
