/**
 * Left navigation, one menu per role (matches the wireframe sidebars).
 *
 * Desktop (>= 992px): always visible on the left.
 * Mobile/tablet: an off-canvas drawer. AppLayout controls `open`; the drawer
 * closes on link click, Escape, or a tap on the dark backdrop.
 */
import { auth } from '../store.js';

export const MENUS = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'bi-grid-1x2', exact: true },
    { to: '/admin/treks', label: 'Treks', icon: 'bi-image-alt' },
    { to: '/admin/staff', label: 'Trekking Staff', icon: 'bi-person-badge' },
    { to: '/admin/users', label: 'Users (Trekkers)', icon: 'bi-people' },
    { to: '/admin/bookings', label: 'Bookings', icon: 'bi-calendar-check' },
    { to: '/admin/search', label: 'Search', icon: 'bi-search' },
    { to: '/admin/reports', label: 'Reports', icon: 'bi-bar-chart-line' },
    { to: '/admin/settings', label: 'Settings', icon: 'bi-gear' },
  ],
  staff: [
    { to: '/staff', label: 'Dashboard', icon: 'bi-grid-1x2', exact: true },
    { to: '/staff/treks', label: 'My Treks', icon: 'bi-signpost-split' },
    { to: '/staff/participants', label: 'Participants', icon: 'bi-people' },
    { to: '/staff/profile', label: 'Profile', icon: 'bi-person-circle' },
  ],
  user: [
    { to: '/user', label: 'Dashboard', icon: 'bi-grid-1x2', exact: true },
    { to: '/user/treks', label: 'Browse Treks', icon: 'bi-compass' },
    { to: '/user/bookings', label: 'My Bookings', icon: 'bi-calendar-check' },
    { to: '/user/history', label: 'History', icon: 'bi-clock-history' },
    { to: '/user/profile', label: 'Profile', icon: 'bi-person-circle' },
  ],
};

export default {
  name: 'Sidebar',
  props: {
    open: { type: Boolean, default: false },      // mobile drawer
    collapsed: { type: Boolean, default: false }, // desktop icon-only rail
  },
  emits: ['close', 'logout', 'toggle-collapse'],
  computed: {
    items() {
      return MENUS[auth.role] || [];
    },
  },
  watch: {
    open(isOpen) {
      if (isOpen) this.$nextTick(() => this.$el.querySelector('.side-nav__link')?.focus());
    },
  },
  methods: {
    isActive(item) {
      const path = this.$route.path;
      return item.exact ? path === item.to : path === item.to || path.startsWith(item.to + '/');
    },
  },
  template: `
    <aside
      id="app-sidebar"
      class="side-nav"
      :class="{ 'is-open': open, 'is-collapsed': collapsed }"
      aria-label="Main menu"
      @keydown.esc="$emit('close')"
    >
      <div class="side-nav__brand">
        <!-- ☰ from the wireframe: collapses the sidebar to icons on desktop -->
        <button
          type="button"
          class="side-nav__toggle d-none d-lg-grid"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :aria-pressed="collapsed ? 'true' : 'false'"
          :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="$emit('toggle-collapse')"
        >
          <i class="bi bi-list" aria-hidden="true"></i>
        </button>
        <span class="side-nav__logo" aria-hidden="true"><i class="bi bi-triangle-half"></i></span>
        <span class="side-nav__brand-text">
          <strong>TMA</strong>
          <small>Trek Management</small>
        </span>
        <button type="button" class="side-nav__close d-lg-none" aria-label="Close menu" @click="$emit('close')">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>

      <nav class="side-nav__menu">
        <router-link
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="side-nav__link"
          :class="{ 'is-active': isActive(item) }"
          :aria-current="isActive(item) ? 'page' : null"
          :title="collapsed ? item.label : null"
          @click="$emit('close')"
        >
          <i class="bi" :class="item.icon" aria-hidden="true"></i>
          <span class="side-nav__label">{{ item.label }}</span>
        </router-link>

        <button
          type="button"
          class="side-nav__link side-nav__logout"
          :title="collapsed ? 'Logout' : null"
          @click="$emit('logout')"
        >
          <i class="bi bi-box-arrow-left" aria-hidden="true"></i>
          <span class="side-nav__label">Logout</span>
        </button>
      </nav>
    </aside>
  `,
};
