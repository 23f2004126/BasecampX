/**
 * Glass login card.
 *
 * The page passes a `login` function (credentials -> Promise<{role,...}>).
 * The card owns everything visual around that call: validation, loading
 * spinner, error shake, confetti on success. When done it emits "success"
 * with the server response, and the page handles the redirect.
 */
import RoleSelector from './RoleSelector.js';
import { addRipple, canHover, confettiBurst, typewriter } from '../utils/motion.js';

const TITLE = 'Welcome Back!'; // wireframe screen 1
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The one hint on the login screen (only shown when Trekking Staff is picked)
const ROLE_NOTES = {
  staff: 'Staff accounts are created by the admin.',
};

export default {
  name: 'LoginCard',
  components: { RoleSelector },
  props: {
    login: { type: Function, required: true },
    initialEmail: { type: String, default: '' },
  },
  emits: ['success'],
  data() {
    return {
      title: '',
      fullTitle: TITLE,
      role: 'user',
      email: this.initialEmail,
      password: '',
      remember: false, // wireframe: 'Remember me' (unchecked = logged in for this tab only)
      showPassword: false,
      touched: { email: false, password: false },
      submitted: false,
      loading: false,
      serverError: '',
      shaking: false,
    };
  },
  computed: {
    errors() {
      const errors = {};
      if (!this.email.trim()) errors.email = 'Please enter your email.';
      else if (!EMAIL_RE.test(this.email.trim())) errors.email = 'That email doesn’t look right.';
      if (!this.password) errors.password = 'Please enter your password.';
      return errors;
    },
    roleNote() {
      return ROLE_NOTES[this.role] || '';
    },
  },
  mounted() {
    this.stopTyping = typewriter(TITLE, (text) => (this.title = text));
    // Focus the first empty field on desktop only (on phones it would pop the keyboard up).
    if (canHover()) {
      this.$nextTick(() => (this.initialEmail ? this.$refs.password : this.$refs.email)?.focus());
    }
  },
  beforeUnmount() {
    this.stopTyping?.();
  },
  methods: {
    /** Show a field's error only after the user left it or pressed submit. */
    showError(field) {
      return (this.touched[field] || this.submitted) && this.errors[field];
    },
    shake() {
      this.shaking = false;
      // Next frame: re-add the class so the animation restarts every time.
      requestAnimationFrame(() => (this.shaking = true));
    },
    async submit(event) {
      this.submitted = true;
      this.serverError = '';
      if (Object.keys(this.errors).length) {
        this.shake();
        const firstBad = this.errors.email ? 'email' : 'password';
        this.$refs[firstBad].focus();
        return;
      }

      this.loading = true;
      try {
        const result = await this.login({
          email: this.email.trim(),
          password: this.password,
          role: this.role,
          remember: this.remember,
        });
        // Celebrate from the button, then let the page redirect.
        const rect = this.$refs.button.getBoundingClientRect();
        await confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
        this.$emit('success', result);
      } catch (error) {
        this.serverError = error.message || 'Something went wrong. Please try again.';
        this.loading = false;
        this.shake();
      }
    },
    addRipple,
  },
  template: `
    <section
      class="glass-card login-card"
      :class="{ 'anim-shake': shaking }"
      aria-labelledby="login-title"
      @animationend.self="shaking = false"
    >
      <div class="glass-card__brand field-in" style="--i: -3">
        <i class="bi bi-triangle-half" aria-hidden="true"></i>
        <span>Trekking Management Application</span>
      </div>

      <h1 id="login-title" class="glass-card__title type-title" :aria-label="fullTitle">
        <span class="type-title__ghost" aria-hidden="true">{{ fullTitle }}</span>
        <span class="type-title__live" aria-hidden="true">{{ title }}<span class="type-caret"></span></span>
      </h1>
      <p class="glass-card__subtitle">Login to your account</p>

      <p class="glass-card__eyebrow">Roles</p>
      <RoleSelector v-model="role" class="mb-3" />

      <form novalidate @submit.prevent="submit">
        <div class="form-floating mb-3 field-in has-icon" style="--i: 0">
          <i class="bi bi-envelope field-icon" aria-hidden="true"></i>
          <input
            id="login-email"
            ref="email"
            v-model="email"
            type="email"
            class="form-control"
            :class="{ 'is-invalid': showError('email') }"
            placeholder="you@example.com"
            autocomplete="email"
            required
            :aria-invalid="showError('email') ? 'true' : 'false'"
            aria-describedby="login-email-error"
            @blur="touched.email = true"
          >
          <label for="login-email">Email address</label>
          <div id="login-email-error" class="invalid-feedback">{{ errors.email }}</div>
        </div>

        <div class="form-floating mb-2 field-in password-field has-icon" style="--i: 1">
          <i class="bi bi-lock field-icon" aria-hidden="true"></i>
          <input
            id="login-password"
            ref="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="form-control"
            :class="{ 'is-invalid': showError('password') }"
            placeholder="Password"
            autocomplete="current-password"
            required
            :aria-invalid="showError('password') ? 'true' : 'false'"
            aria-describedby="login-password-error"
            @blur="touched.password = true"
          >
          <label for="login-password">Password</label>
          <button
            type="button"
            class="password-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword ? 'true' : 'false'"
            @click="showPassword = !showPassword"
          >
            <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'" aria-hidden="true"></i>
          </button>
          <div id="login-password-error" class="invalid-feedback">{{ errors.password }}</div>
        </div>

        <div class="form-check mb-3 field-in" style="--i: 2">
          <input id="login-remember" v-model="remember" class="form-check-input" type="checkbox">
          <label class="form-check-label" for="login-remember">Remember me</label>
        </div>

        <div v-if="serverError" class="form-alert field-in" role="alert">
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          <span>{{ serverError }}</span>
        </div>

        <button
          ref="button"
          type="submit"
          class="btn btn-summit btn-lg w-100 has-ripple field-in"
          style="--i: 3"
          :disabled="loading"
          @pointerdown="addRipple"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ loading ? 'Logging in…' : 'Login' }}
        </button>
      </form>

      <div v-if="role === 'user' || roleNote" class="glass-card__footer field-in" style="--i: 4">
        <p v-if="role === 'user'" class="mb-0">
          Don't have an account?<br>
          <router-link to="/register" class="fw-semibold">Register as User (Trekker)</router-link>
        </p>
        <p v-else-if="roleNote" class="mb-0 text-moss small">
          <i class="bi bi-info-circle me-1" aria-hidden="true"></i>{{ roleNote }}
        </p>
      </div>
    </section>
  `,
};
