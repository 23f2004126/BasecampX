/**
 * Admin > Reviews (moderation).
 *   GET    /api/admin/reviews?hidden=&trek_id=&page=
 *   PUT    /api/admin/reviews/<id>/hide | unhide
 *   DELETE /api/admin/reviews/<id>
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import StarRating from '../../components/StarRating.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { toast } from '../../components/Toast.js';
import { del, get, put } from '../../api.js';
import { prefs } from '../../store.js';
import { formatDate } from '../../utils/format.js';

export default {
  name: 'ManageReviews',
  components: { Loader, EmptyState, Pagination, StarRating },
  data: () => ({ hidden: '', trekId: '', treks: [], rows: [], page: 1, pages: 1, total: 0, loading: true, busyId: null }),
  watch: {
    hidden() { this.load(1); },
    trekId() { this.load(1); },
  },
  mounted() {
    this.load();
    get('/admin/treks?status=Completed&per_page=100').then((d) => (this.treks = d.items)).catch(() => {});
  },
  methods: {
    formatDate,
    async load(page = this.page) {
      this.loading = true;
      const params = new URLSearchParams({ page, per_page: prefs.perPage });
      if (this.hidden) params.set('hidden', this.hidden);
      if (this.trekId) params.set('trek_id', this.trekId);
      try {
        const data = await get(`/admin/reviews?${params}`);
        Object.assign(this, { rows: data.items, page: data.page, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
    async toggle(r) {
      this.busyId = r.id;
      try {
        await put(`/admin/reviews/${r.id}/${r.is_hidden ? 'unhide' : 'hide'}`);
        toast.success(r.is_hidden ? 'Review is visible again.' : `Review hidden. ${r.user_name} was notified.`);
        await this.load();
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.busyId = null;
      }
    },
    async remove(r) {
      const ok = await confirmDialog({
        title: 'Delete this review?', message: `${r.user_name}'s review of ${r.trek_name} will be removed permanently.`,
        confirmText: 'Delete review', tone: 'danger',
      });
      if (!ok) return;
      try {
        await del(`/admin/reviews/${r.id}`);
        toast.success('Review deleted.');
        await this.load(this.rows.length === 1 && this.page > 1 ? this.page - 1 : this.page);
      } catch (error) {
        toast.error(error.message);
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">Reviews</h1>
      <div class="filter-bar mb-3">
        <select v-model="hidden" class="form-select filter-bar__select" aria-label="Visibility">
          <option value="">All reviews</option>
          <option value="false">Visible</option>
          <option value="true">Hidden</option>
        </select>
        <select v-model="trekId" class="form-select filter-bar__select filter-bar__select--wide" aria-label="Trek">
          <option value="">Trek: All</option>
          <option v-for="t in treks" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
        </select>
      </div>

      <Loader v-if="loading" label="Loading reviews…" />
      <EmptyState v-else-if="!rows.length" title="No reviews here" message="Reviews appear once trekkers complete a trek." />
      <template v-else>
        <ul class="review-admin">
          <li v-for="(r, i) in rows" :key="r.id" class="panel review-admin__item stagger" :class="{ 'is-hidden': r.is_hidden }" :style="{ '--i': i }">
            <div class="review__head">
              <span class="avatar avatar--sm" aria-hidden="true">{{ (r.user_name || '?')[0] }}</span>
              <strong>{{ r.user_name }}</strong>
              <span class="text-moss">on {{ r.trek_name }}</span>
              <StarRating :value="r.rating" />
              <span v-if="r.is_hidden" class="badge-soft badge-closed">Hidden</span>
              <span class="text-moss small ms-auto">{{ formatDate(r.created_at) }}</span>
            </div>
            <p class="review__text">{{ r.comment || '(no comment)' }}</p>
            <div class="d-flex gap-2 justify-content-end">
              <button type="button" class="btn btn-sm" :class="r.is_hidden ? 'btn-outline-success' : 'btn-outline-primary'" :disabled="busyId === r.id" @click="toggle(r)">
                <i class="bi me-1" :class="r.is_hidden ? 'bi-eye' : 'bi-eye-slash'"></i>{{ r.is_hidden ? 'Unhide' : 'Hide' }}
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" @click="remove(r)"><i class="bi bi-trash me-1"></i>Delete</button>
            </div>
          </li>
        </ul>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-moss small">{{ total }} review{{ total === 1 ? '' : 's' }}</span>
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>
    </section>
  `,
};
