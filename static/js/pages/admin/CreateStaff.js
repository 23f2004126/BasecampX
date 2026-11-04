/**
 * Create New Trekking Staff (wireframe screen 5).
 *   POST /api/admin/staff  (the backend emails the login details)
 *   Status "Blacklisted" -> PUT /api/admin/users/<id>/blacklist right after creating.
 */
import { toast } from '../../components/Toast.js';
import { post, put } from '../../api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

export default {
  name: 'CreateStaff',
  data() {
    return {
      form: {
        full_name: '', email: '', contact_number: '', password: '', confirm: '',
        experience_years: '', specialization: '', status: 'Active',
      },
      errors: {},
      saving: false,
    };
  },
  methods: {
    validate() {
      const f = this.form;
      const e = {};
      if (f.full_name.trim().length < 2) e.full_name = 'Enter the full name.';
      if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.';
      if (!PHONE_RE.test(f.contact_number.trim())) e.contact_number = '10-digit mobile number starting with 6–9.';
      if (f.password.length < 6) e.password = 'At least 6 characters.';
      if (f.confirm !== f.password) e.confirm = "Passwords don't match.";
      if (!/^\d{1,2}$/.test(String(f.experience_years))) e.experience_years = 'Years of experience (0–60).';
      this.errors = e;
      return !Object.keys(e).length;
    },
    async create() {
      if (!this.validate()) return;
      const f = this.form;
      this.saving = true;
      try {
        const res = await post('/admin/staff', {
          full_name: f.full_name.trim(), email: f.email.trim(), contact_number: f.contact_number.trim(),
          password: f.password, experience_years: Number(f.experience_years), specialization: f.specialization.trim(),
        });
        if (f.status === 'Blacklisted') await put(`/admin/users/${res.staff.id}/blacklist`);
        toast.success(`Login details were emailed to ${res.staff.email}.`, { title: `${res.staff.full_name} added` });
        this.$router.push('/admin/staff');
      } catch (error) {
        const map = { email: 'email', full_name: 'full_name', contact_number: 'contact_number', password: 'password', experience_years: 'experience_years' };
        this.errors = Object.fromEntries(Object.entries(error.errors || {}).map(([k, v]) => [map[k] || k, v]));
        if (error.status === 409) this.errors.email = error.message;
        toast.error(error.message);
      } finally {
        this.saving = false;
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">Create New Trekking Staff</h1>
      <form class="panel form-narrow stagger" novalidate @submit.prevent="create">
        <div class="row g-3">
          <div class="col-md-6">
            <label for="cs-name" class="form-label">Full Name</label>
            <input id="cs-name" v-model="form.full_name" class="form-control" :class="{ 'is-invalid': errors.full_name }" autocomplete="off">
            <div class="invalid-feedback">{{ errors.full_name }}</div>
          </div>
          <div class="col-md-6">
            <label for="cs-email" class="form-label">Email Address</label>
            <input id="cs-email" v-model="form.email" type="email" class="form-control" :class="{ 'is-invalid': errors.email }" autocomplete="off">
            <div class="invalid-feedback">{{ errors.email }}</div>
          </div>
          <div class="col-md-6">
            <label for="cs-phone" class="form-label">Contact Number</label>
            <input id="cs-phone" v-model="form.contact_number" class="form-control" :class="{ 'is-invalid': errors.contact_number }" inputmode="numeric" maxlength="10">
            <div class="invalid-feedback">{{ errors.contact_number }}</div>
          </div>
          <div class="col-md-6">
            <label for="cs-pw" class="form-label">Password</label>
            <input id="cs-pw" v-model="form.password" type="password" class="form-control" :class="{ 'is-invalid': errors.password }" autocomplete="new-password">
            <div class="invalid-feedback">{{ errors.password }}</div>
          </div>
          <div class="col-md-6">
            <label for="cs-confirm" class="form-label">Confirm Password</label>
            <input id="cs-confirm" v-model="form.confirm" type="password" class="form-control" :class="{ 'is-invalid': errors.confirm }" autocomplete="new-password">
            <div class="invalid-feedback">{{ errors.confirm }}</div>
          </div>
          <div class="col-12">
            <label for="cs-exp" class="form-label">Experience</label>
            <input id="cs-exp" v-model="form.experience_years" class="form-control" :class="{ 'is-invalid': errors.experience_years }"
                   inputmode="numeric" maxlength="2" placeholder="e.g. 5 (years)">
            <div class="invalid-feedback">{{ errors.experience_years }}</div>
          </div>
          <div class="col-12">
            <label for="cs-spec" class="form-label">Specialization</label>
            <input id="cs-spec" v-model="form.specialization" class="form-control" maxlength="120" placeholder="e.g. High Altitude, First Aid">
          </div>
          <div class="col-md-6">
            <label for="cs-status" class="form-label">Status</label>
            <select id="cs-status" v-model="form.status" class="form-select">
              <option>Active</option>
              <option>Blacklisted</option>
            </select>
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2 mt-4">
          <router-link to="/admin/staff" class="btn btn-outline-primary">Cancel</router-link>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Create Staff
          </button>
        </div>
      </form>
    </section>
  `,
};
