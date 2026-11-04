/**
 * Edit your own account: details + change password.
 * Used by Admin > Settings and Staff > Profile (any role).
 *   GET /api/profile
 *   PUT /api/profile  {full_name, contact_number[, experience_years, specialization]}
 *   PUT /api/profile  {current_password, new_password}  -> new token (other devices signed out)
 */
import Loader from './Loader.js';
import { toast } from './Toast.js';
import { get, put } from '../api.js';
import { ROLE_LABELS, auth, setAuth } from '../store.js';
import { formatDate } from '../utils/format.js';

const PHONE_RE = /^[6-9]\d{9}$/;

export default {
  name: 'AccountForms',
  components: { Loader },
  props: {
    staffFields: { type: Boolean, default: false },
  },
  data() {
    return {
      loading: true,
      me: null,
      form: { full_name: '', contact_number: '', experience_years: '', specialization: '' },
      errors: {},
      saving: false,
      pw: { current: '', next: '', confirm: '' },
      pwErrors: {},
      savingPw: false,
      roleLabels: ROLE_LABELS,
    };
  },
  computed: {
    changed() {
      if (!this.me) return false;
      const f = this.form;
      const p = this.me.staff_profile || {};
      return f.full_name.trim() !== (this.me.full_name || '')
        || f.contact_number.trim() !== (this.me.contact_number || '')
        || (this.staffFields && (String(f.experience_years) !== String(p.experience_years ?? '')
          || f.specialization.trim() !== (p.specialization || '')));
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    formatDate,
    async load() {
      try {
        this.me = await get('/profile');
        const p = this.me.staff_profile || {};
        this.form = {
          full_name: this.me.full_name || '',
          contact_number: this.me.contact_number || '',
          experience_years: p.experience_years ?? '',
          specialization: p.specialization || '',
        };
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },

    async save() {
      const f = this.form;
      const e = {};
      if (f.full_name.trim().length < 2) e.full_name = 'Please enter your full name.';
      if (!PHONE_RE.test(f.contact_number.trim())) e.contact_number = 'Enter a 10-digit mobile number starting with 6–9.';
      if (this.staffFields && !/^\d{1,2}$/.test(String(f.experience_years))) e.experience_years = 'Years of experience (0–60).';
      this.errors = e;
      if (Object.keys(e).length) return;

      const body = { full_name: f.full_name.trim(), contact_number: f.contact_number.trim() };
      if (this.staffFields) Object.assign(body, { experience_years: Number(f.experience_years), specialization: f.specialization.trim() });
      this.saving = true;
      try {
        const res = await put('/profile', body);
        setAuth({ token: auth.token, role: auth.role, id: auth.id, full_name: res.user.full_name });
        toast.success('Profile updated.');
        await this.load();
      } catch (error) {
        this.errors = error.errors || {};
        toast.error(error.message);
      } finally {
        this.saving = false;
      }
    },

    async changePassword() {
      const e = {};
      if (!this.pw.current) e.current = 'Enter your current password.';
      if (this.pw.next.length < 6) e.next = 'Use at least 6 characters.';
      if (this.pw.confirm !== this.pw.next) e.confirm = "Passwords don't match.";
      this.pwErrors = e;
      if (Object.keys(e).length) return;
      this.savingPw = true;
      try {
        const res = await put('/profile', { current_password: this.pw.current, new_password: this.pw.next });
        setAuth({ token: res.token, role: auth.role, id: auth.id, full_name: res.user.full_name });
        this.pw = { current: '', next: '', confirm: '' };
        toast.success('Password changed. Other devices were signed out.');
      } catch (error) {
        const fields = error.errors || {};
        this.pwErrors = { current: fields.current_password, next: fields.new_password };
        toast.error(error.message);
      } finally {
        this.savingPw = false;
      }
    },
  },
  template: `
    <Loader v-if="loading" label="Loading your account…" />
    <div v-else-if="me" class="row g-4">
      <div class="col-lg-6 stagger">
        <form class="panel h-100" novalidate @submit.prevent="save">
          <div class="d-flex align-items-center gap-3 mb-4">
            <span class="avatar avatar--lg" aria-hidden="true">{{ (me.full_name || '?')[0] }}</span>
            <div>
              <h2 class="panel__title mb-0">{{ me.full_name }}</h2>
              <p class="text-moss small mb-0">
                <span class="role-badge" :class="'role-badge--' + me.role">{{ roleLabels[me.role] }}</span>
                · since {{ formatDate(me.created_at) }}
              </p>
            </div>
          </div>
          <div class="mb-3">
            <label for="acc-email" class="form-label">Email</label>
            <input id="acc-email" class="form-control" :value="me.email" readonly>
          </div>
          <div class="mb-3">
            <label for="acc-name" class="form-label">Full name</label>
            <input id="acc-name" v-model="form.full_name" class="form-control" :class="{ 'is-invalid': errors.full_name }" autocomplete="name">
            <div class="invalid-feedback">{{ errors.full_name }}</div>
          </div>
          <div class="mb-3">
            <label for="acc-phone" class="form-label">Contact number</label>
            <input id="acc-phone" v-model="form.contact_number" class="form-control" :class="{ 'is-invalid': errors.contact_number }"
                   inputmode="numeric" maxlength="10" autocomplete="tel-national">
            <div class="invalid-feedback">{{ errors.contact_number }}</div>
          </div>
          <div v-if="staffFields" class="row g-3 mb-3">
            <div class="col-sm-4">
              <label for="acc-exp" class="form-label">Experience (years)</label>
              <input id="acc-exp" v-model="form.experience_years" class="form-control" :class="{ 'is-invalid': errors.experience_years }" inputmode="numeric" maxlength="2">
              <div class="invalid-feedback">{{ errors.experience_years }}</div>
            </div>
            <div class="col-sm-8">
              <label for="acc-spec" class="form-label">Specialization</label>
              <input id="acc-spec" v-model="form.specialization" class="form-control" :class="{ 'is-invalid': errors.specialization }" maxlength="120">
              <div class="invalid-feedback">{{ errors.specialization }}</div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary mt-2" :disabled="saving || !changed">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Save changes
          </button>
        </form>
      </div>

      <div class="col-lg-6 stagger" style="--i: 1">
        <form class="panel h-100" novalidate @submit.prevent="changePassword">
          <h2 class="panel__title">Change password</h2>
          <div class="mb-3">
            <label for="acc-pw-cur" class="form-label">Current password</label>
            <input id="acc-pw-cur" v-model="pw.current" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.current }" autocomplete="current-password">
            <div class="invalid-feedback">{{ pwErrors.current }}</div>
          </div>
          <div class="mb-3">
            <label for="acc-pw-new" class="form-label">New password</label>
            <input id="acc-pw-new" v-model="pw.next" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.next }" autocomplete="new-password">
            <div class="invalid-feedback">{{ pwErrors.next }}</div>
          </div>
          <div class="mb-4">
            <label for="acc-pw-confirm" class="form-label">Confirm new password</label>
            <input id="acc-pw-confirm" v-model="pw.confirm" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.confirm }" autocomplete="new-password">
            <div class="invalid-feedback">{{ pwErrors.confirm }}</div>
          </div>
          <button type="submit" class="btn btn-outline-primary" :disabled="savingPw">
            <span v-if="savingPw" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Update password
          </button>
        </form>
      </div>
    </div>
  `,
};
