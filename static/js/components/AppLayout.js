/**
 * Shell for every logged-in page:
 *
 *   [Sidebar] | [Navbar                 ]
 *             | [page content (router)  ]
 *             | [TrekkerFooter          ]
 *
 * - The page area is a nested <router-view> wrapped in a <transition>, so the
 *   content fades up whenever the route changes.
 * - On mount it calls GET /api/me once to confirm the session is still valid
 *   and to refresh the user's name (it may have been edited elsewhere).
 */
import Sidebar from './Sidebar.js';
import Navbar from './Navbar.js';
import TrekkerFooter from './TrekkerFooter.js';
import { toast } from './Toast.js';
import { get, logout } from '../api.js';
import { auth, clearAuth, prefs, setAuth, setPref } from '../store.js';

export default {
  name: 'AppLayout',
  components: { Sidebar, Navbar, TrekkerFooter },
  data() {
    return { menuOpen: false };
  },
  computed: {
    collapsed: () => prefs.sidebarCollapsed, // also switchable in Admin > Settings
  },
  watch: {
    // Close the mobile drawer whenever the page changes
    '$route.fullPath'() {
      this.menuOpen = false;
    },
    menuOpen(open) {
      document.body.classList.toggle('no-scroll', open);
    },
  },
  async mounted() {
    const token = auth.token;
    try {
      const me = await get('/me');
      // Only apply if the user didn't log out (or switch account) meanwhile,
      // otherwise a slow reply would write the old token back into storage.
      if (auth.token === token) {
        setAuth({ token, role: me.role, id: me.id, full_name: me.full_name });
      }
    } catch (error) {
      if (error.status === 403) {
        // e.g. blacklisted since the last login
        clearAuth();
        toast.error(error.message);
        this.$router.replace('/login');
      }
    }
  },
  beforeUnmount() {
    document.body.classList.remove('no-scroll');
  },
  methods: {
    toggleCollapse() {
      setPref('sidebarCollapsed', !prefs.sidebarCollapsed);
    },
    async onLogout() {
      await logout();
      toast.info('You have been signed out. See you on the trail!');
      this.$router.replace('/login');
    },
  },
  template: `
    <div class="app-shell" :class="{ 'is-collapsed': collapsed }">
      <a class="skip-link" href="#main-content">Skip to content</a>

      <Sidebar
        :open="menuOpen"
        :collapsed="collapsed"
        @close="menuOpen = false"
        @logout="onLogout"
        @toggle-collapse="toggleCollapse"
      />
      <div v-if="menuOpen" class="side-nav__backdrop d-lg-none" aria-hidden="true" @click="menuOpen = false"></div>

      <div class="app-main">
        <Navbar :menu-open="menuOpen" @toggle-menu="menuOpen = !menuOpen" @logout="onLogout" />

        <main id="main-content" class="app-content" tabindex="-1">
          <router-view v-slot="{ Component, route }">
            <transition name="page" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
        </main>

        <TrekkerFooter />
      </div>
    </div>
  `,
};
