/**
 * Client-side routes (hash mode: URLs look like /#/admin/treks, so Flask only
 * ever serves "/" and refreshing any page still works).
 *
 * Each role has ONE parent route that renders AppLayout (sidebar + navbar +
 * footer) and a list of child pages rendered inside it. The parent carries
 * meta.role, and the guard below checks it for every child.
 *
 *   guestOnly: true   -> logged-in users are sent to their own dashboard
 *   role: 'admin'...  -> no token  -> /login (and come back after logging in)
 *                        wrong role -> their own dashboard
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import NotFound from './pages/NotFound.js';
import AppLayout from './components/AppLayout.js';
import EmptyState from './components/EmptyState.js';
import AdminSettings from './pages/admin/Settings.js';
import StaffParticipants from './pages/staff/Participants.js';
import { auth, dashboardPath, isLoggedIn } from './store.js';

/**
 * TEMPORARY: stands in for pages that are built in later parts of Phase 5b,
 * so every menu link already works and the layout can be tested.
 */
const ComingSoon = {
  name: 'ComingSoon',
  components: { EmptyState },
  template: `
    <section>
      <h1 class="page-title">{{ $route.meta.title }}</h1>
      <EmptyState
        title="This page is on its way"
        :message="'It will be built in part ' + $route.meta.part + ' of Phase 5b.'"
      />
    </section>
  `,
};

// A helper so each child route is one readable line.
const page = (path, title, part, component = ComingSoon) => ({ path, component, meta: { title, part } });

const routes = [
  { path: '/', redirect: () => (isLoggedIn() ? dashboardPath() : '/login') },
  { path: '/login', component: Login, meta: { guestOnly: true, title: 'Sign in' } },
  { path: '/register', component: Register, meta: { guestOnly: true, title: 'Register' } },

  {
    path: '/admin',
    component: AppLayout,
    meta: { role: 'admin' },
    children: [
      page('', 'Dashboard', 2),
      page('treks', 'Manage Treks', 2),
      page('staff', 'Trekking Staff', 2),
      page('staff/new', 'Create Trekking Staff', 2),
      page('users', 'Users (Trekkers)', 2),
      page('bookings', 'All Bookings', 2),
      page('search', 'Search', 2),
      page('reports', 'Reports', 2),
      page('settings', 'Settings', 2, AdminSettings),
    ],
  },
  {
    path: '/staff',
    component: AppLayout,
    meta: { role: 'staff' },
    children: [
      page('', 'My Dashboard', 3),
      page('treks', 'My Treks', 3),
      page('treks/:id(\\d+)', 'Manage Trek', 3),
      page('participants', 'Participants', 3, StaffParticipants),
      page('profile', 'Profile', 3),
    ],
  },
  {
    path: '/user',
    component: AppLayout,
    meta: { role: 'user' },
    children: [
      page('', 'Dashboard', 4),
      page('treks', 'Browse Treks', 4),
      page('treks/:id(\\d+)', 'Trek Details', 4),
      page('bookings', 'My Bookings', 4),
      page('history', 'Trekking History', 4),
      page('profile', 'Profile', 4),
    ],
  },

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
  // Children inherit the role of their parent layout route.
  const requiredRole = to.matched.find((record) => record.meta.role)?.meta.role;
  if (requiredRole) {
    if (!isLoggedIn()) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (auth.role !== requiredRole) {
      return dashboardPath(); // wrong area for this role -> their own dashboard
    }
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TMA` : 'TMA · Trek Management App';
});

export default router;
