/**
 * Trekker registration (only trekkers can sign up; staff are created by the admin).
 * Still background + particles + the same glass card as Login.
 * Live checks: password strength, password match, Indian mobile number.
 * On success: toast, card slides out, then we go to Login with the email filled in.
 */
import AuthBackground from '../components/AuthBackground.js';
import ParticleLayer from '../components/ParticleLayer.js';
import TiltCard from '../components/TiltCard.js';
import { toast } from '../components/Toast.js';
import { post } from '../api.js';
import { addRipple, canHover, prefersReducedMotion, typewriter } from '../utils/motion.js';

const TITLE = 'Create User Account'; // wireframe screen 2
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/; // 10 digits, starts with 6-9
const MIN_PASSWORD = 6;                   // same rule as the backend

const STRENGTH = [
  { label: 'Too short', tone: 'weak' },
  { label: 'Weak', tone: 'weak' },
  { label: 'Fair', tone: 'fair' },
  { label: 'Good', tone: 'good' },
  { label: 'Strong', tone: 'strong' },
];

// Server field names -> our field names
const SERVER_FIELDS = { full_name: 'fullName', email: 'email', password: 'password', contact_number: 'contact' };

export default {
  name: 'RegisterPage',
  components: { AuthBackground, ParticleLayer, TiltCard },
  data() {
    return {
      ready: false,
      title: '',
      fullTitle: TITLE,
      form: { fullName: '', email: '', password: '', confirm: '', contact: '' },
      touched: {},
      submitted: false,
      serverErrors: {},
      serverError: '',
      loading: false,
      leaving: false,
      shaking: false,
      showPassword: false,
    };
  },
  computed: {
    strength() {
      const p = this.form.password;
      let score = 0;
      if (p.length >= 8) score++;
      if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
      if (/\d/.test(p)) score++;
      if (/[^A-Za-z0-9]/.test(p)) score++;
      if (p.length >= 12) score++;
      score = p.length < MIN_PASSWORD ? 0 : Math.min(Math.max(score, 1), 4);
      return { score, ...STRENGTH[score] };
    },
    passwordsMatch() {
      return this.form.confirm.length > 0 && this.form.confirm === this.form.password;
    },
    errors() {
      const f = this.form;
      const e = {};
      if (f.fullName.trim().length < 2) e.fullName = 'Please enter your full name.';
      if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address.';
      if (f.password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
      if (!f.confirm) e.confirm = 'Please confirm your password.';
      else if (f.confirm !== f.password) e.confirm = 'Passwords don’t match.';
      if (!INDIAN_MOBILE_RE.test(f.contact)) e.contact = 'Enter a 10-digit mobile number starting with 6–9.';
      return e;
    },
  },
  watch: {
    // Editing a field clears the server's error for it.
    form: {
      deep: true,
      handler() {
        this.serverErrors = {};
        this.serverError = '';
      },
    },
  },
  beforeUnmount() {
    this.stopTyping?.();
    clearTimeout(this.leaveTimer);
  },
  methods: {
    onBackgroundReady() {
      this.ready = true;
      this.$nextTick(() => {
        this.stopTyping = typewriter(TITLE, (text) => (this.title = text));
        if (canHover()) this.$refs.fullName?.focus();
      });
    },
    fieldError(field) {
      if (this.serverErrors[field]) return this.serverErrors[field];
      return (this.touched[field] || this.submitted) ? this.errors[field] : '';
    },
    touch(field) {
      this.touched = { ...this.touched, [field]: true };
    },
    /** Keep only digits in the phone field (people type spaces or +91). */
    cleanContact() {
      this.form.contact = this.form.contact.replace(/\D/g, '').slice(-10);
    },
    shake() {
      this.shaking = false;
      requestAnimationFrame(() => (this.shaking = true));
    },
    async submit() {
      this.submitted = true;
      const order = ['fullName', 'email', 'password', 'confirm', 'contact'];
      const firstBad = order.find((f) => this.errors[f]);
      if (firstBad) {
        this.shake();
        this.$refs[firstBad]?.focus();
        return;
      }

      this.loading = true;
      try {
        await post('/register', {
          full_name: this.form.fullName.trim(),
          email: this.form.email.trim(),
          password: this.form.password,
          contact_number: this.form.contact,
        }, { withAuth: false });

        toast.success('Account created! Sign in to start your first trek.', { title: 'Welcome aboard' });
        this.leaving = true; // card slides out to the left
        const email = this.form.email.trim().toLowerCase();
        this.leaveTimer = setTimeout(
          () => this.$router.push({ path: '/login', query: { email } }),
          prefersReducedMotion() ? 0 : 450,
        );
      } catch (error) {
        this.loading = false;
        if (error.status === 409) {
          this.serverErrors = { email: error.message };
        } else if (error.errors && Object.keys(error.errors).length) {
          const mapped = {};
          for (const [key, message] of Object.entries(error.errors)) {
            mapped[SERVER_FIELDS[key] || key] = message;
          }
          this.serverErrors = mapped;
        } else {
          this.serverError = error.message;
        }
        this.shake();
      }
    },
    addRipple,
  },
  template: `
    <main class="auth-page">
      <AuthBackground mode="still" @done="onBackgroundReady" />
      <ParticleLayer />
      <div class="auth-stage">
        <div v-if="ready" class="auth-stage__slot card-enter" :class="{ 'is-leaving': leaving }">
          <TiltCard :max="6">
            <section
              class="glass-card register-card"
              :class="{ 'anim-shake': shaking }"
              aria-labelledby="register-title"
              @animationend.self="shaking = false"
            >
              <h1 id="register-title" class="glass-card__title type-title" :aria-label="fullTitle">
                <span class="type-title__ghost" aria-hidden="true">{{ fullTitle }}</span>
                <span class="type-title__live" aria-hidden="true">{{ title }}<span class="type-caret"></span></span>
              </h1>
              <p class="glass-card__subtitle">Register as a Trekker</p>

              <form novalidate @submit.prevent="submit">
                <div class="form-floating mb-3 field-in has-icon" style="--i: 0">
                  <i class="bi bi-person field-icon" aria-hidden="true"></i>
                  <input id="reg-name" ref="fullName" v-model="form.fullName" type="text" class="form-control"
                         :class="{ 'is-invalid': fieldError('fullName') }" placeholder="Full Name"
                         autocomplete="name" required minlength="2"
                         :aria-invalid="fieldError('fullName') ? 'true' : 'false'" aria-describedby="reg-name-error"
                         @blur="touch('fullName')">
                  <label for="reg-name">Full Name</label>
                  <div id="reg-name-error" class="invalid-feedback">{{ fieldError('fullName') }}</div>
                </div>

                <div class="form-floating mb-3 field-in has-icon" style="--i: 1">
                  <i class="bi bi-envelope field-icon" aria-hidden="true"></i>
                  <input id="reg-email" ref="email" v-model="form.email" type="email" class="form-control"
                         :class="{ 'is-invalid': fieldError('email') }" placeholder="you@example.com"
                         autocomplete="email" required
                         :aria-invalid="fieldError('email') ? 'true' : 'false'" aria-describedby="reg-email-error"
                         @blur="touch('email')">
                  <label for="reg-email">Email address</label>
                  <div id="reg-email-error" class="invalid-feedback">{{ fieldError('email') }}</div>
                </div>

                <div class="form-floating mb-1 field-in password-field has-icon" style="--i: 2">
                  <i class="bi bi-lock field-icon" aria-hidden="true"></i>
                  <input id="reg-password" ref="password" v-model="form.password"
                         :type="showPassword ? 'text' : 'password'" class="form-control"
                         :class="{ 'is-invalid': fieldError('password') }" placeholder="Password"
                         autocomplete="new-password" required :minlength="6"
                         :aria-invalid="fieldError('password') ? 'true' : 'false'"
                         aria-describedby="reg-password-error reg-strength"
                         @blur="touch('password')">
                  <label for="reg-password">Password</label>
                  <button type="button" class="password-toggle"
                          :aria-label="showPassword ? 'Hide passwords' : 'Show passwords'"
                          :aria-pressed="showPassword ? 'true' : 'false'"
                          @click="showPassword = !showPassword">
                    <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'" aria-hidden="true"></i>
                  </button>
                  <div id="reg-password-error" class="invalid-feedback">{{ fieldError('password') }}</div>
                </div>

                <div class="strength field-in" style="--i: 2" :class="'strength--' + strength.tone">
                  <div class="strength__track" aria-hidden="true">
                    <div class="strength__bar" :style="{ width: (form.password ? Math.max(strength.score, 0.4) * 25 : 0) + '%' }"></div>
                  </div>
                  <span id="reg-strength" class="strength__label" aria-live="polite">
                    {{ form.password ? 'Strength: ' + strength.label : 'Tip: mix letters, numbers and symbols' }}
                  </span>
                </div>

                <div class="form-floating mb-3 field-in has-icon" style="--i: 3">
                  <i class="bi bi-lock field-icon" aria-hidden="true"></i>
                  <input id="reg-confirm" ref="confirm" v-model="form.confirm"
                         :type="showPassword ? 'text' : 'password'" class="form-control"
                         :class="{ 'is-invalid': fieldError('confirm'), 'is-valid': passwordsMatch }"
                         placeholder="Confirm Password" autocomplete="new-password" required
                         :aria-invalid="fieldError('confirm') ? 'true' : 'false'" aria-describedby="reg-confirm-msg"
                         @blur="touch('confirm')">
                  <label for="reg-confirm">Confirm Password</label>
                  <div v-if="passwordsMatch" id="reg-confirm-msg" class="valid-feedback">
                    <i class="bi bi-check2-circle" aria-hidden="true"></i> Passwords match
                  </div>
                  <div v-else id="reg-confirm-msg" class="invalid-feedback">{{ fieldError('confirm') }}</div>
                </div>

                <div class="form-floating mb-3 field-in contact-field has-icon" style="--i: 4">
                  <i class="bi bi-telephone field-icon" aria-hidden="true"></i>
                  <input id="reg-contact" ref="contact" v-model="form.contact" type="tel" inputmode="numeric"
                         class="form-control" :class="{ 'is-invalid': fieldError('contact') }"
                         placeholder="9876543210" autocomplete="tel-national" maxlength="14" required
                         pattern="[6-9][0-9]{9}"
                         :aria-invalid="fieldError('contact') ? 'true' : 'false'" aria-describedby="reg-contact-hint reg-contact-error"
                         @input="cleanContact" @blur="touch('contact')">
                  <label for="reg-contact">Contact Number</label>
                  <div id="reg-contact-hint" class="form-text field-hint">10-digit Indian mobile number</div>
                  <div id="reg-contact-error" class="invalid-feedback">{{ fieldError('contact') }}</div>
                </div>

                <div v-if="serverError" class="form-alert" role="alert">
                  <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                  <span>{{ serverError }}</span>
                </div>

                <button type="submit" class="btn btn-summit btn-lg w-100 has-ripple field-in" style="--i: 5"
                        :disabled="loading" @pointerdown="addRipple">
                  <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ loading ? 'Registering…' : 'Register' }}
                </button>
              </form>

              <div class="glass-card__footer field-in" style="--i: 6">
                <p class="mb-0">
                  Already have an account?
                  <router-link to="/login" class="fw-semibold">Login here</router-link>
                </p>
              </div>
            </section>
          </TiltCard>
        </div>
      </div>
    </main>
  `,
};
