/**
 * Staff > Participants (sidebar item from wireframe screen 8; the
 * "View All Participants" link on screen 9 opens it filtered by trek).
 *
 * Everyone booked on the staff member's assigned treks. Built from the
 * existing APIs: GET /api/staff/treks, then GET /api/staff/treks/<id> for
 * each trek's participant list.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { badgeClass, formatDate } from '../../utils/format.js';

export default {
  name: 'StaffParticipants',
  components: { Loader, EmptyState },
  data() {
    return {
      loading: true,
      treks: [],
      rows: [],
      trekFilter: String(this.$route.query.trek || ''),
      search: '',
    };
  },
  computed: {
    filtered() {
      const q = this.search.trim().toLowerCase();
      return this.rows.filter((r) =>
        (!this.trekFilter || String(r.trek_id) === this.trekFilter) &&
        (!q || `${r.full_name} ${r.email} ${r.contact_number}`.toLowerCase().includes(q)));
    },
  },
  watch: {
    trekFilter(value) {
      // keep the URL in sync so the filtered view can be shared/bookmarked
      this.$router.replace({ query: value ? { trek: value } : {} });
    },
  },
  async mounted() {
    try {
      const list = await get('/staff/treks?per_page=100');
      this.treks = list.items;
      const details = await Promise.all(list.items.map((t) => get(`/staff/treks/${t.id}`)));
      this.rows = details.flatMap((trek) =>
        trek.participants.map((p) => ({ ...p, trek_id: trek.id, trek_name: trek.name })));
    } catch (error) {
      toast.error(error.message);
    } finally {
      this.loading = false;
    }
  },
  methods: { formatDate, badgeClass },
  template: `
    <section>
      <div class="page-head">
        <h1 class="page-title mb-0">Participants ({{ filtered.length }})</h1>
      </div>

      <Loader v-if="loading" label="Gathering your participants…" />

      <template v-else>
        <div class="filter-bar mb-3">
          <div class="input-icon flex-grow-1">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input v-model="search" type="search" class="form-control" placeholder="Search name, email or contact…"
                   aria-label="Search participants">
          </div>
          <select v-model="trekFilter" class="form-select filter-bar__select" aria-label="Filter by trek">
            <option value="">All my treks</option>
            <option v-for="t in treks" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
          </select>
        </div>

        <EmptyState
          v-if="!filtered.length"
          :title="rows.length ? 'No participants match' : 'No participants yet'"
          :message="rows.length ? 'Try a different search or trek.' : 'When trekkers book your treks, they will appear here.'"
        />

        <div v-else class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Contact</th>
                <th scope="col">Trek</th>
                <th scope="col">Booking Date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in filtered" :key="p.booking_id" class="stagger" :style="{ '--i': i }">
                <td data-label="#">{{ i + 1 }}</td>
                <td data-label="Name" class="fw-semibold">{{ p.full_name }}</td>
                <td data-label="Email">{{ p.email }}</td>
                <td data-label="Contact">{{ p.contact_number }}</td>
                <td data-label="Trek">
                  <router-link :to="'/staff/treks/' + p.trek_id">{{ p.trek_name }}</router-link>
                </td>
                <td data-label="Booking Date">{{ formatDate(p.booking_date) }}</td>
                <td data-label="Status"><span :class="badgeClass(p.booking_status)">{{ p.booking_status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  `,
};
