/**
 * Login page.
 * 1. AuthBackground plays the intro video (hikers reach the summit).
 * 2. When it emits "done", the card is rendered and rises in from the right.
 * 3. LoginCard calls our login() -> POST /api/login, we store the session,
 *    then (after the confetti) redirect to the dashboard for that role.
 * Already-logged-in users never get here: the router guard redirects them.
 */
import AuthBackground from '../components/AuthBackground.js';
import ParticleLayer from '../components/ParticleLayer.js';
import TiltCard from '../components/TiltCard.js';
import LoginCard from '../components/LoginCard.js';
import { toast } from '../components/Toast.js';
import { post } from '../api.js';
import { ROLE_LABELS, dashboardPath, setAuth } from '../store.js';

export default {
  name: 'LoginPage',
  components: { AuthBackground, ParticleLayer, TiltCard, LoginCard },
  data() {
    return { ready: false, chosenRole: 'user' };
  },
  computed: {
    initialEmail() {
      const email = this.$route.query.email;
      return typeof email === 'string' ? email : '';
    },
  },
  methods: {
    async login({ email, password, role }) {
      const data = await post('/login', { email, password }, { withAuth: false });
      setAuth(data);
      this.chosenRole = role;
      return data;
    },
    onSuccess(data) {
      // The server decides the role; the tile is just a hint. Tell the user if they differ.
      if (data.role !== this.chosenRole) {
        toast.info(`Signed in as ${ROLE_LABELS[data.role] || data.role}.`);
      } else {
        toast.success(`Welcome back, ${data.full_name || 'trekker'}!`);
      }
      const redirect = this.$route.query.redirect;
      const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//');
      this.$router.replace(safeRedirect ? redirect : dashboardPath(data.role));
    },
  },
  template: `
    <main class="auth-page">
      <AuthBackground mode="video" @done="ready = true" />
      <ParticleLayer />
      <div class="auth-stage">
        <div v-if="ready" class="auth-stage__slot card-enter">
          <TiltCard>
            <LoginCard :login="login" :initial-email="initialEmail" @success="onSuccess" />
          </TiltCard>
        </div>
      </div>
    </main>
  `,
};
