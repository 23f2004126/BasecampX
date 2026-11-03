/**
 * Trekker > Trekking History (wireframe screen 12): completed and cancelled
 * bookings, plus "Export CSV".
 *
 * Export flow (Celery):
 *   1. POST /api/user/export            -> { task_id }   (returns immediately)
 *   2. GET  /api/tasks/<task_id> every 2s until SUCCESS / FAILURE
 *   3. SUCCESS -> toast with a Download button (GET /api/exports/<file>)
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import { toast } from '../../components/Toast.js';
import { download, get, post } from '../../api.js';
import { prefs } from '../../store.js';
import { badgeClass, formatDate, formatRange } from '../../utils/format.js';

const POLL_EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 60000;

export default {
  name: 'UserHistory',
  components: { Loader, EmptyState, Pagination },
  data() {
    return { loading: true, rows: [], page: 1, pages: 1, total: 0, exporting: false };
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    clearTimeout(this.pollTimer);
  },
  methods: {
    formatDate,
    formatRange,
    badgeClass,

    async load(page = 1) {
      this.loading = true;
      try {
        const data = await get(`/user/history?page=${page}&per_page=${prefs.perPage}`);
        Object.assign(this, { rows: data.items, page: data.page, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },

    completedOn(b) {
      return b.status === 'Completed' ? formatDate(b.trek.end_date) : '—';
    },

    // ---- CSV export ----
    async startExport() {
      this.exporting = true;
      try {
        const { task_id: taskId } = await post('/user/export');
        this.pollStarted = Date.now();
        this.poll(taskId);
      } catch (error) {
        this.exporting = false;
        toast.error(error.message);
      }
    },

    async poll(taskId) {
      try {
        const job = await get(`/tasks/${taskId}`);
        if (job.status === 'SUCCESS') {
          this.exporting = false;
          const path = job.download_url.replace(/^\/api/, '');
          toast.success('We also emailed you a copy.', {
            title: 'Your export is ready',
            timeout: 0,
            action: { label: 'Download', icon: 'bi-download', onClick: () => this.save(path) },
          });
          return;
        }
        if (job.status === 'FAILURE') throw new Error(job.message);
        if (Date.now() - this.pollStarted > GIVE_UP_AFTER_MS) {
          throw new Error('The export is taking too long. Please try again in a minute.');
        }
        this.pollTimer = setTimeout(() => this.poll(taskId), POLL_EVERY_MS);
      } catch (error) {
        this.exporting = false;
        toast.error(error.message);
      }
    },

    async save(path) {
      try {
        await download(path, 'tma-bookings.csv');
      } catch (error) {
        toast.error(error.message);
      }
    },
  },
  template: `
    <section>
      <div class="page-head">
        <h1 class="page-title mb-0">Trekking History</h1>
        <button type="button" class="btn btn-outline-primary" :disabled="exporting" @click="startExport">
          <span v-if="exporting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
          <i v-else class="bi bi-filetype-csv me-1" aria-hidden="true"></i>
          {{ exporting ? 'Preparing CSV…' : 'Export CSV' }}
        </button>
      </div>

      <Loader v-if="loading" label="Loading your history…" />

      <EmptyState
        v-else-if="!rows.length"
        title="No trekking history yet"
        message="Completed and cancelled treks will show up here."
        action-label="Browse treks"
        action-to="/user/treks"
        icon="bi-compass"
      />

      <template v-else>
        <div class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead>
              <tr>
                <th scope="col">Trek Name</th>
                <th scope="col">Trek Dates</th>
                <th scope="col">Completed On</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in rows" :key="b.id" class="stagger" :style="{ '--i': i }">
                <td data-label="Trek Name" class="fw-semibold">{{ b.trek_name }}</td>
                <td data-label="Trek Dates">{{ formatRange(b.trek.start_date, b.trek.end_date) }}</td>
                <td data-label="Completed On">{{ completedOn(b) }}</td>
                <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-end mt-3">
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>
    </section>
  `,
};
