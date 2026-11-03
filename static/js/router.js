/**
 * Client-side routes (hash mode: URLs look like /#/login, so Flask only
 * ever needs to serve "/" and refreshing any page still works).
 *
 * Route meta:
 *   guestOnly: true      -> logged-in users are sent to their dashboard
 *   role: 'admin' | ...  -> must be logged in with this role
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import NotFound from './pages/NotFound.js';
import Loader from './components/Loader.js';
import EmptyState from './components/EmptyState.js';
import TrekkerFooter from './components/TrekkerFooter.js';
import { get, post } from './api.js';
import { ROLE_LABELS, auth, clearAuth, dashboardPath, isLoggedIn } from './store.js';

/**
 * TEMPORARY dashboard used for all three roles until the real dashboards are
 * built (Phase 5b). It proves the login redirect works, checks the token with
 * GET /api/me, and shows the shared Loader, EmptyState and footer.
 */
const DashboardPlaceholder = {
  name: 'DashboardPlaceholder',
  components: { Loader, EmptyState, TrekkerFooter },
  data() {
    return { me: null, roleLabels: ROLE_LABELS };
  },
  async mounted() {
    try {
      this.me = await get('/me');
    } catch (error) {
      this.$toast.error(error.message);
    }
  },
  methods: {
    async logout() {
      try {
        await post('/logout');
      } catch {
        /* token may already be invalid - log out locally anyway */
      }
      clearAuth();
      this.$toast.info('You have been signed out.');
      this.$router.replace('/login');
    },
  },
  template: `
    <div class="page-shell">
      <main class="container py-5 flex-grow-1">
        <Loader v-if="!me" label="Checking your session…" />
        <template v-else>
          <p class="text-moss mb-1 fw-semibold">{{ roleLabels[me.role] }} dashboard</p>
          <h1 class="mb-4">Hi, {{ me.full_name }} 👋</h1>
          <EmptyState
            title="Your dashboard is on its way"
            message="This page will be built in the next phase. Your login worked and your token is valid."
            action-label="Sign out"
            icon="bi-box-arrow-right"
            @action="logout"
          />
        </template>
      </main>
      <TrekkerFooter />
    </div>
  `,
};

const routes = [
  { path: '/', redirect: () => (isLoggedIn() ? dashboardPath() : '/login') },
  { path: '/login', component: Login, meta: { guestOnly: true, title: 'Sign in' } },
  { path: '/register', component: Register, meta: { guestOnly: true, title: 'Register' } },
  { path: '/admin', component: DashboardPlaceholder, meta: { role: 'admin', title: 'Admin' } },
  { path: '/staff', component: DashboardPlaceholder, meta: { role: 'staff', title: 'Staff' } },
  { path: '/user', component: DashboardPlaceholder, meta: { role: 'user', title: 'My treks' } },
  // Must stay last: anything unknown shows the 404 page.
  { path: '/:pathMatch(.*)*', component: NotFound, meta: { title: 'Page not found' } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  if (to.meta.guestOnly && isLoggedIn()) {
    return dashboardPath();
  }
  if (to.meta.role) {
    if (!isLoggedIn()) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (auth.role !== to.meta.role) {
      return dashboardPath(); // wrong area for this role -> their own dashboard
    }
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TMA` : 'TMA · Trek Management App';
});

export default router;
