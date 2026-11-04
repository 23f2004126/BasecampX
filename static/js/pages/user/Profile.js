/**
 * Trekker profile.
 *   GET /api/user/profile
 *   PUT /api/user/profile  {full_name, contact_number}
 *   PUT /api/user/profile  {current_password, new_password} -> returns a new token
 *     (other devices are signed out; this one stays logged in with the new token)
 */
import Loader from '../../components/Loader.js';
import { toast } from '../../components/Toast.js';
import { get, put } from '../../api.js';
import { auth, setAuth } from '../../store.js';
import { formatDate } from '../../utils/format.js';

const PHONE_RE = /^[6-9]\d{9}$/;

export default {
  name: 'UserProfile',
  components: { Loader },
  data() {
    return {
      loading: true,
      me: null,
      details: { full_name: '', contact_number: '' },
      detailErrors: {},
      savingDetails: false,
      pw: { current: '', next: '', confirm: '' },
      pwErrors: {},
      savingPw: false,
    };
  },
  computed: {
    detailsChanged() {
      return this.me && (this.details.full_name.trim() !== this.me.full_name
        || this.details.contact_number.trim() !== (this.me.contact_number || ''));
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    formatDate,
    async load() {
      try {
        this.me = await get('/user/profile');
        this.details = { full_name: this.me.full_name || '', contact_number: this.me.contact_number || '' };
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },

    async saveDetails() {
      const e = {};
      if (this.details.full_name.trim().length < 2) e.full_name = 'Please enter your full name.';
      if (!PHONE_RE.test(this.details.contact_number.trim())) e.contact_number = 'Enter a 10-digit mobile number starting with 6–9.';
      this.detailErrors = e;
      if (Object.keys(e).length) return;

      this.savingDetails = true;
      try {
        const res = await put('/user/profile', {
          full_name: this.details.full_name.trim(), contact_number: this.details.contact_number.trim(),
        });
        setAuth({ token: auth.token, role: auth.role, id: auth.id, full_name: res.user.full_name }); // navbar name
        toast.success('Profile updated.');
        await this.load();
      } catch (error) {
        this.detailErrors = error.errors || {};
        toast.error(error.message);
      } finally {
        this.savingDetails = false;
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
        const res = await put('/user/profile', { current_password: this.pw.current, new_password: this.pw.next });
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
    <section>
      <h1 class="page-title mb-4">Profile</h1>
      <Loader v-if="loading" label="Loading your profile…" />

      <div v-else-if="me" class="row g-4">
        <div class="col-lg-6 stagger">
          <form class="panel h-100" novalidate @submit.prevent="saveDetails">
            <div class="d-flex align-items-center gap-3 mb-4">
              <span class="avatar avatar--lg" aria-hidden="true">{{ (me.full_name || '?')[0] }}</span>
              <div>
                <h2 class="panel__title mb-0">{{ me.full_name }}</h2>
                <p class="text-moss small mb-0">Trekker since {{ formatDate(me.created_at) }}</p>
              </div>
            </div>
            <div class="mb-3">
              <label for="p-email" class="form-label">Email</label>
              <input id="p-email" class="form-control" :value="me.email" readonly>
            </div>
            <div class="mb-3">
              <label for="p-name" class="form-label">Full name</label>
              <input id="p-name" v-model="details.full_name" class="form-control" :class="{ 'is-invalid': detailErrors.full_name }" autocomplete="name">
              <div class="invalid-feedback">{{ detailErrors.full_name }}</div>
            </div>
            <div class="mb-4">
              <label for="p-phone" class="form-label">Contact number</label>
              <input id="p-phone" v-model="details.contact_number" class="form-control" :class="{ 'is-invalid': detailErrors.contact_number }"
                     inputmode="numeric" maxlength="10" autocomplete="tel-national">
              <div class="invalid-feedback">{{ detailErrors.contact_number }}</div>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="savingDetails || !detailsChanged">
              <span v-if="savingDetails" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Save changes
            </button>
          </form>
        </div>

        <div class="col-lg-6 stagger" style="--i: 1">
          <form class="panel h-100" novalidate @submit.prevent="changePassword">
            <h2 class="panel__title">Change password</h2>
            <div class="mb-3">
              <label for="pw-cur" class="form-label">Current password</label>
              <input id="pw-cur" v-model="pw.current" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.current }" autocomplete="current-password">
              <div class="invalid-feedback">{{ pwErrors.current }}</div>
            </div>
            <div class="mb-3">
              <label for="pw-new" class="form-label">New password</label>
              <input id="pw-new" v-model="pw.next" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.next }" autocomplete="new-password">
              <div class="invalid-feedback">{{ pwErrors.next }}</div>
            </div>
            <div class="mb-4">
              <label for="pw-confirm" class="form-label">Confirm new password</label>
              <input id="pw-confirm" v-model="pw.confirm" type="password" class="form-control" :class="{ 'is-invalid': pwErrors.confirm }" autocomplete="new-password">
              <div class="invalid-feedback">{{ pwErrors.confirm }}</div>
            </div>
            <button type="submit" class="btn btn-outline-primary" :disabled="savingPw">
              <span v-if="savingPw" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Update password
            </button>
          </form>
        </div>
      </div>
    </section>
  `,
};
