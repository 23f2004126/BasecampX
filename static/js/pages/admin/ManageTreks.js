/**
 * Admin > Treks (wireframe screen 4).
 *   GET    /api/admin/treks?search=&status=&page=
 *   POST / PUT via TrekForm, DELETE /api/admin/treks/<id>
 *   Checklist: GET /api/treks/<id>/checklist, POST /api/admin/treks/<id>/checklist,
 *              DELETE /api/admin/checklist/<item_id>
 * Everything re-fetches from the API after a change.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import TrekForm from './TrekForm.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { toast } from '../../components/Toast.js';
import { del, get, post } from '../../api.js';
import { prefs } from '../../store.js';
import { badgeClass } from '../../utils/format.js';
import { TREK_STATUSES } from '../../utils/constants.js';

const CATEGORIES = ['Documents', 'Clothing', 'Gear', 'Health'];

export default {
  name: 'ManageTreks',
  components: { Loader, EmptyState, Pagination, TrekForm },
  data() {
    return {
      statuses: TREK_STATUSES,
      categories: CATEGORIES,
      search: '',
      status: '',
      rows: [],
      page: 1,
      pages: 1,
      total: 0,
      loading: true,
      editing: undefined, // undefined = closed, null = new trek, object = edit
      checklist: null,     // { trek, items, loading, form }
    };
  },
  watch: {
    search() {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.load(1), 350);
    },
    status() {
      this.load(1);
    },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    clearTimeout(this.debounce);
  },
  methods: {
    badgeClass,
    async load(page = this.page) {
      this.loading = true;
      const params = new URLSearchParams({ page, per_page: prefs.perPage });
      if (this.search.trim()) params.set('search', this.search.trim());
      if (this.status) params.set('status', this.status);
      try {
        const data = await get(`/admin/treks?${params}`);
        Object.assign(this, { rows: data.items, page: data.page, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
    saved() {
      this.editing = undefined;
      this.load();
    },
    async remove(trek) {
      const ok = await confirmDialog({
        title: `Delete ${trek.name}?`, message: 'This cannot be undone. Treks with bookings cannot be deleted - close them instead.',
        confirmText: 'Delete trek', tone: 'danger',
      });
      if (!ok) return;
      try {
        await del(`/admin/treks/${trek.id}`);
        toast.success(`${trek.name} deleted.`);
        await this.load(this.rows.length === 1 && this.page > 1 ? this.page - 1 : this.page);
      } catch (error) {
        toast.error(error.message);
      }
    },

    // ---- checklist ----
    async openChecklist(trek) {
      this.checklist = { trek, items: [], loading: true, form: { item: '', category: 'Gear', is_essential: false }, error: '' };
      await this.loadChecklist();
    },
    async loadChecklist() {
      const c = this.checklist;
      try {
        const data = await get(`/treks/${c.trek.id}/checklist`);
        c.items = data.categories.flatMap((g) => g.items);
      } catch (error) {
        toast.error(error.message);
      } finally {
        c.loading = false;
      }
    },
    async addItem() {
      const c = this.checklist;
      if (c.form.item.trim().length < 2) {
        c.error = 'Describe the item (2–150 characters).';
        return;
      }
      try {
        await post(`/admin/treks/${c.trek.id}/checklist`, { ...c.form, item: c.form.item.trim() });
        toast.success('Checklist item added.');
        c.form = { item: '', category: c.form.category, is_essential: false };
        c.error = '';
        await this.loadChecklist();
      } catch (error) {
        c.error = error.errors ? Object.values(error.errors).join(' ') : error.message;
      }
    },
    async removeItem(item) {
      try {
        await del(`/admin/checklist/${item.id}`);
        toast.success('Checklist item removed.');
        await this.loadChecklist();
      } catch (error) {
        toast.error(error.message);
      }
    },
  },
  template: `
    <section>
      <div class="page-head">
        <h1 class="page-title mb-0">Treks</h1>
        <button type="button" class="btn btn-primary" @click="editing = null"><i class="bi bi-plus-lg me-1"></i>Add New Trek</button>
      </div>

      <div class="filter-bar mb-3">
        <div class="input-icon flex-grow-1">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input v-model="search" type="search" class="form-control" placeholder="Search treks…" aria-label="Search treks">
        </div>
        <select v-model="status" class="form-select filter-bar__select" aria-label="Status">
          <option value="">Status: All</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <Loader v-if="loading" label="Loading treks…" />
      <EmptyState v-else-if="!rows.length" title="No treks found" :message="search || status ? 'Try another search or status.' : 'Add your first trek.'" />
      <template v-else>
        <div class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead>
              <tr><th>ID</th><th>Trek Name</th><th>Location</th><th>Difficulty</th><th>Slots</th><th>Status</th><th>Trek leader</th><th class="text-end">Actions</th></tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in rows" :key="t.id" class="stagger" :style="{ '--i': i }">
                <td data-label="ID" class="text-moss">{{ t.id }}</td>
                <td data-label="Trek Name" class="fw-semibold">{{ t.name }}</td>
                <td data-label="Location">{{ t.location }}</td>
                <td data-label="Difficulty"><span :class="badgeClass(t.difficulty)">{{ t.difficulty }}</span></td>
                <td data-label="Slots" :class="{ 'text-danger fw-semibold': t.available_slots <= 3 }">{{ t.available_slots }} / {{ t.total_slots }}</td>
                <td data-label="Status"><span :class="badgeClass(t.status)">{{ t.status }}</span></td>
                <td data-label="Trek leader">{{ t.staff_name || '—' }}</td>
                <td class="td-actions text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-icon btn-outline-primary" :aria-label="'Edit ' + t.name" title="Edit" @click="editing = t"><i class="bi bi-pencil"></i></button>
                  <button type="button" class="btn btn-sm btn-icon btn-outline-primary ms-1" :aria-label="'Packing checklist for ' + t.name" title="Checklist" @click="openChecklist(t)"><i class="bi bi-list-check"></i></button>
                  <button type="button" class="btn btn-sm btn-icon btn-outline-danger ms-1" :aria-label="'Delete ' + t.name" title="Delete" @click="remove(t)"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-moss small">{{ total }} trek{{ total === 1 ? '' : 's' }}</span>
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>

      <TrekForm v-if="editing !== undefined" :trek="editing" @close="editing = undefined" @saved="saved" />

      <div v-if="checklist" class="tma-modal" @keydown.esc="checklist = null">
        <div class="tma-modal__backdrop" @click="checklist = null"></div>
        <div class="tma-modal__dialog tma-modal__dialog--lg" role="dialog" aria-modal="true" aria-labelledby="cl-title">
          <h2 id="cl-title" class="tma-modal__title">Packing checklist · {{ checklist.trek.name }}</h2>
          <p class="text-moss small">Default items come from the {{ checklist.trek.difficulty }} list. Add extra items for this trek below.</p>
          <p v-if="checklist.loading" class="text-moss">Loading…</p>
          <ul v-else class="checklist-admin">
            <li v-for="item in checklist.items" :key="item.id" :class="{ 'is-default': !item.trek_specific }">
              <span class="checklist-admin__cat">{{ item.category }}</span>
              <span class="flex-grow-1">{{ item.item }} <span v-if="item.is_essential" class="packing__essential">Essential</span></span>
              <button v-if="item.trek_specific" type="button" class="btn btn-sm btn-icon btn-outline-danger" :aria-label="'Remove ' + item.item" @click="removeItem(item)"><i class="bi bi-x-lg"></i></button>
              <span v-else class="small text-moss">default</span>
            </li>
          </ul>
          <form class="checklist-admin__add" novalidate @submit.prevent="addItem">
            <input v-model="checklist.form.item" class="form-control" placeholder="e.g. Nepal visa / passport" aria-label="New item" maxlength="150">
            <select v-model="checklist.form.category" class="form-select" aria-label="Category">
              <option v-for="c in categories" :key="c">{{ c }}</option>
            </select>
            <div class="form-check text-nowrap">
              <input id="cl-ess" v-model="checklist.form.is_essential" class="form-check-input" type="checkbox">
              <label class="form-check-label" for="cl-ess">Essential</label>
            </div>
            <button type="submit" class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg"></i> Add</button>
          </form>
          <p v-if="checklist.error" class="text-danger small mt-2 mb-0" role="alert">{{ checklist.error }}</p>
          <div class="tma-modal__actions">
            <button type="button" class="btn btn-outline-primary" @click="checklist = null">Done</button>
          </div>
        </div>
      </div>
    </section>
  `,
};
