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
// Admin
import AdminDashboard from './pages/admin/AdminDashboard.js';
import ManageTreks from './pages/admin/ManageTreks.js';
import ManageStaff from './pages/admin/ManageStaff.js';
import CreateStaff from './pages/admin/CreateStaff.js';
import ManageUsers from './pages/admin/ManageUsers.js';
import AllBookings from './pages/admin/AllBookings.js';
import AdminSearch from './pages/admin/AdminSearch.js';
import AdminReports from './pages/admin/Reports.js';
import ManageReviews from './pages/admin/ManageReviews.js';
import AdminSettings from './pages/admin/Settings.js';
// Staff
import StaffDashboard from './pages/staff/StaffDashboard.js';
import StaffMyTreks from './pages/staff/MyTreks.js';
import ManageTrek from './pages/staff/ManageTrek.js';
import StaffParticipants from './pages/staff/Participants.js';
import StaffProfile from './pages/staff/StaffProfile.js';
// Trekker
import UserDashboard from './pages/user/UserDashboard.js';
import BrowseTreks from './pages/user/BrowseTreks.js';
import TrekDetails from './pages/user/TrekDetails.js';
import Checkout from './pages/user/Checkout.js';
import MyBookings from './pages/user/MyBookings.js';
import UserHistory from './pages/user/History.js';
import UserProfile from './pages/user/Profile.js';
import { auth, dashboardPath, isLoggedIn } from './store.js';

// A helper so each child route is one readable line.
const page = (path, title, component) => ({ path, component, meta: { title } });

const routes = [
  { path: '/', redirect: () => (isLoggedIn() ? dashboardPath() : '/login') },
  { path: '/login', component: Login, meta: { guestOnly: true, title: 'Sign in' } },
  { path: '/register', component: Register, meta: { guestOnly: true, title: 'Register' } },

  {
    path: '/admin',
    component: AppLayout,
    meta: { role: 'admin' },
    children: [
      page('', 'Dashboard', AdminDashboard),
      page('treks', 'Manage Treks', ManageTreks),
      page('staff', 'Trekking Staff', ManageStaff),
      page('staff/new', 'Create Trekking Staff', CreateStaff),
      page('users', 'Users (Trekkers)', ManageUsers),
      page('bookings', 'All Bookings', AllBookings),
      page('search', 'Search', AdminSearch),
      page('reports', 'Reports', AdminReports),
      page('reviews', 'Reviews', ManageReviews),
      page('settings', 'Settings', AdminSettings),
    ],
  },
  {
    path: '/staff',
    component: AppLayout,
    meta: { role: 'staff' },
    children: [
      page('', 'My Dashboard', StaffDashboard),
      page('treks', 'My Treks', StaffMyTreks),
      page('treks/:id(\\d+)', 'Manage Trek', ManageTrek),
      page('participants', 'Participants', StaffParticipants),
      page('profile', 'Profile', StaffProfile),
    ],
  },
  {
    path: '/user',
    component: AppLayout,
    meta: { role: 'user' },
    children: [
      page('', 'Dashboard', UserDashboard),
      page('treks', 'Browse Treks', BrowseTreks),
      page('treks/:id(\\d+)', 'Trek Details', TrekDetails),
      page('checkout/:bookingId(\\d+)', 'Checkout', Checkout),
      page('bookings', 'My Bookings', MyBookings),
      page('history', 'Trekking History', UserHistory),
      page('profile', 'Profile', UserProfile),
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
