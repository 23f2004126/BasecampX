/**
 * Trekker > Trekking History (wireframe screen 12): completed and cancelled
 * bookings, plus "Export CSV".
 *
 * Export flow (Celery):
 *   1. POST /api/user/export            -> { task_id }   (returns immediately)
 *   2. GET  /api/tasks/<task_id> every 2s until SUCCESS / FAILURE
 *   3. SUCCESS -> toast with a Download button (GET /api/exports/<file>)
 *
 * Completed treks: "Rate trek" (POST /api/reviews) and "Certificate"
 * (GET /api/user/bookings/<id>/certificate, PDF).
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import StarRating from '../../components/StarRating.js';
import { toast } from '../../components/Toast.js';
import { download, get, post } from '../../api.js';
import { prefs } from '../../store.js';
import { badgeClass, formatDate, formatRange } from '../../utils/format.js';

const POLL_EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 60000;

export default {
  name: 'UserHistory',
  components: { Loader, EmptyState, Pagination, StarRating },
  data() {
    return {
      loading: true, rows: [], page: 1, pages: 1, total: 0, exporting: false,
      review: null, // { booking, rating, comment, error, saving } while the dialog is open
      downloadingId: null,
    };
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

    // ---- Reviews ----
    openReview(b) {
      this.review = { booking: b, rating: 0, comment: '', error: '', saving: false };
      this.$nextTick(() => this.$refs.stars?.$el.focus());
    },
    async submitReview() {
      const r = this.review;
      if (!r.rating) {
        r.error = 'Choose 1 to 5 stars.';
        return;
      }
      r.saving = true;
      try {
        await post('/reviews', { booking_id: r.booking.id, rating: r.rating, comment: r.comment.trim() });
        toast.success(`Thanks for reviewing ${r.booking.trek_name}!`);
        this.review = null;
        await this.load(this.page);
      } catch (error) {
        r.error = error.errors?.comment || error.message;
        r.saving = false;
      }
    },

    // ---- Certificate ----
    async certificate(b) {
      this.downloadingId = b.id;
      try {
        await download(`/user/bookings/${b.id}/certificate`, 'certificate.pdf');
        toast.success('Certificate downloaded.');
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.downloadingId = null;
      }
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
                <th scope="col" class="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in rows" :key="b.id" class="stagger" :style="{ '--i': i }">
                <td data-label="Trek Name" class="fw-semibold">{{ b.trek_name }}</td>
                <td data-label="Trek Dates">{{ formatRange(b.trek.start_date, b.trek.end_date) }}</td>
                <td data-label="Completed On">{{ completedOn(b) }}</td>
                <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
                <td class="td-actions text-end text-nowrap">
                  <template v-if="b.status === 'Completed'">
                    <span v-if="b.reviewed" class="small text-moss me-2"><i class="bi bi-check2"></i> Reviewed</span>
                    <button v-else type="button" class="btn btn-sm btn-outline-primary me-1" @click="openReview(b)">
                      <i class="bi bi-star me-1" aria-hidden="true"></i>Rate trek
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" :disabled="downloadingId === b.id" @click="certificate(b)">
                      <span v-if="downloadingId === b.id" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                      <i v-else class="bi bi-award me-1" aria-hidden="true"></i>Certificate
                    </button>
                  </template>
                  <span v-else class="text-moss">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-end mt-3">
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>

      <Transition name="modal">
        <div v-if="review" class="tma-modal" @keydown.esc="review = null">
          <div class="tma-modal__backdrop" @click="review = null"></div>
          <form class="tma-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" novalidate @submit.prevent="submitReview">
            <h2 id="review-title" class="tma-modal__title">Rate {{ review.booking.trek_name }}</h2>
            <div class="mb-3">
              <StarRating ref="stars" v-model="review.rating" editable label="Your rating" class="stars--lg" />
            </div>
            <label for="review-comment" class="form-label">Your review <span class="text-moss small">(optional)</span></label>
            <textarea id="review-comment" v-model="review.comment" class="form-control" rows="4" maxlength="500"
                      placeholder="What stood out? Trail, campsites, trek leader…"></textarea>
            <p class="form-text text-end mb-0">{{ review.comment.length }} / 500</p>
            <p v-if="review.error" class="text-danger small mb-0" role="alert">{{ review.error }}</p>
            <div class="tma-modal__actions">
              <button type="button" class="btn btn-outline-primary" @click="review = null">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="review.saving">
                <span v-if="review.saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Submit review
              </button>
            </div>
          </form>
        </div>
      </Transition>
    </section>
  `,
};
