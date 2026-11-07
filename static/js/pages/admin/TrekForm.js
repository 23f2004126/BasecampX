/**
 * Create / edit a trek in a modal (opened from Manage Treks).
 *   POST /api/admin/treks            (create)
 *   PUT  /api/admin/treks/<id>       (edit)
 *   PUT  /api/admin/treks/<id>/assign {staff_id}   when the staff choice changed
 * Emits "saved" so the list re-fetches from the API.
 */
import { toast } from '../../components/Toast.js';
import { get, post, put } from '../../api.js';
import { TREK_DIFFICULTIES, TREK_STATUSES } from '../../utils/constants.js';

const EMPTY = {
  name: '', location: '', difficulty: 'Moderate', duration_days: '', total_slots: '', price: '',
  start_date: '', end_date: '', status: 'Pending', staff_id: '', image_url: '', description: '', instructions: '',
};

export default {
  name: 'TrekForm',
  props: {
    trek: { type: Object, default: null }, // null = create
  },
  emits: ['close', 'saved'],
  data() {
    const t = this.trek;
    return {
      form: t ? {
        ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, t[k] ?? ''])), staff_id: t.staff_id ?? '',
      } : { ...EMPTY },
      difficulties: TREK_DIFFICULTIES,
      statuses: TREK_STATUSES,
      staff: [],
      errors: {},
      saving: false,
    };
  },
  async mounted() {
    this.$nextTick(() => this.$refs.first?.focus());
    try {
      this.staff = (await get('/admin/staff?per_page=100')).items.filter((s) => !s.is_blacklisted);
    } catch {
      /* the dropdown just stays empty */
    }
  },
  methods: {
    validate() {
      const f = this.form;
      const e = {};
      for (const k of ['name', 'location']) if (!String(f[k]).trim()) e[k] = 'Required.';
      if (!(Number.isInteger(+f.duration_days) && +f.duration_days > 0)) e.duration_days = 'Whole number above 0.';
      if (!(Number.isInteger(+f.total_slots) && +f.total_slots > 0)) e.total_slots = 'Slots must be more than 0.';
      if (f.price === '' || !(+f.price >= 0)) e.price = 'Price must be 0 or more.';
      if (!f.start_date) e.start_date = 'Required.';
      if (!f.end_date) e.end_date = 'Required.';
      else if (f.start_date && f.end_date < f.start_date) e.end_date = "End date can't be before the start date.";
      this.errors = e;
      return !Object.keys(e).length;
    },
    async save() {
      if (!this.validate()) return;
      const f = this.form;
      const body = {
        name: f.name.trim(), location: f.location.trim(), difficulty: f.difficulty,
        duration_days: +f.duration_days, total_slots: +f.total_slots, price: +f.price,
        start_date: f.start_date, end_date: f.end_date, status: f.status,
        image_url: f.image_url.trim(), description: f.description.trim(), instructions: f.instructions.trim(),
      };
      this.saving = true;
      try {
        const res = this.trek ? await put(`/admin/treks/${this.trek.id}`, body) : await post('/admin/treks', body);
        const id = res.trek.id;
        const staffId = f.staff_id === '' ? null : +f.staff_id;
        if (staffId !== (this.trek?.staff_id ?? null)) await put(`/admin/treks/${id}/assign`, { staff_id: staffId });
        const promoted = res.promoted_from_waitlist ? ` ${res.promoted_from_waitlist} promoted from the waitlist.` : '';
        toast.success((this.trek ? `${body.name} updated.` : `${body.name} created.`) + promoted);
        this.$emit('saved');
      } catch (error) {
        this.errors = error.errors || {};
        toast.error(error.message);
      } finally {
        this.saving = false;
      }
    },
  },
  template: `
    <div class="tma-modal" @keydown.esc="$emit('close')">
      <div class="tma-modal__backdrop" @click="$emit('close')"></div>
      <form class="tma-modal__dialog tma-modal__dialog--lg" role="dialog" aria-modal="true" aria-labelledby="trek-form-title" novalidate @submit.prevent="save">
        <h2 id="trek-form-title" class="tma-modal__title">{{ trek ? 'Edit ' + trek.name : 'Add New Trek' }}</h2>
        <div class="row g-3">
          <div class="col-md-6">
            <label for="tf-name" class="form-label">Trek name</label>
            <input id="tf-name" ref="first" v-model="form.name" class="form-control" :class="{ 'is-invalid': errors.name }">
            <div class="invalid-feedback">{{ errors.name }}</div>
          </div>
          <div class="col-md-6">
            <label for="tf-loc" class="form-label">Location</label>
            <input id="tf-loc" v-model="form.location" class="form-control" :class="{ 'is-invalid': errors.location }">
            <div class="invalid-feedback">{{ errors.location }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-diff" class="form-label">Difficulty</label>
            <select id="tf-diff" v-model="form.difficulty" class="form-select">
              <option v-for="d in difficulties" :key="d">{{ d }}</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-days" class="form-label">Duration (days)</label>
            <input id="tf-days" v-model="form.duration_days" type="number" min="1" class="form-control" :class="{ 'is-invalid': errors.duration_days }">
            <div class="invalid-feedback">{{ errors.duration_days }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-slots" class="form-label">Total slots</label>
            <input id="tf-slots" v-model="form.total_slots" type="number" min="1" class="form-control" :class="{ 'is-invalid': errors.total_slots }">
            <div class="invalid-feedback">{{ errors.total_slots }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-price" class="form-label">Price (₹)</label>
            <input id="tf-price" v-model="form.price" type="number" min="0" class="form-control" :class="{ 'is-invalid': errors.price }">
            <div class="invalid-feedback">{{ errors.price }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-start" class="form-label">Start date</label>
            <input id="tf-start" v-model="form.start_date" type="date" class="form-control" :class="{ 'is-invalid': errors.start_date }">
            <div class="invalid-feedback">{{ errors.start_date }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-end" class="form-label">End date</label>
            <input id="tf-end" v-model="form.end_date" type="date" class="form-control" :class="{ 'is-invalid': errors.end_date }">
            <div class="invalid-feedback">{{ errors.end_date }}</div>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-status" class="form-label">Status</label>
            <select id="tf-status" v-model="form.status" class="form-select">
              <option v-for="s in statuses" :key="s">{{ s }}</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label for="tf-staff" class="form-label">Trek leader</label>
            <select id="tf-staff" v-model="form.staff_id" class="form-select">
              <option value="">Not assigned</option>
              <option v-for="s in staff" :key="s.id" :value="s.id">{{ s.full_name }}</option>
            </select>
          </div>
          <div class="col-12">
            <label for="tf-img" class="form-label">Image URL <span class="text-moss small">(optional)</span></label>
            <input id="tf-img" v-model="form.image_url" class="form-control" placeholder="/static/img/treks/brahmatal.jpg">
          </div>
          <div class="col-md-6">
            <label for="tf-desc" class="form-label">Description</label>
            <textarea id="tf-desc" v-model="form.description" class="form-control" rows="3"></textarea>
          </div>
          <div class="col-md-6">
            <label for="tf-ins" class="form-label">Instructions</label>
            <textarea id="tf-ins" v-model="form.instructions" class="form-control" rows="3"></textarea>
          </div>
        </div>
        <div class="tma-modal__actions">
          <button type="button" class="btn btn-outline-primary" @click="$emit('close')">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>{{ trek ? 'Save changes' : 'Create trek' }}
          </button>
        </div>
      </form>
    </div>
  `,
};
