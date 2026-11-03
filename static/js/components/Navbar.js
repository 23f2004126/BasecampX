/**
 * Top bar: menu button (mobile), app name, page title, a reserved slot for
 * the notification bell (Phase 8), and the user menu (Profile / Logout).
 * The dropdown uses Bootstrap's own JS (data-bs-toggle="dropdown").
 */
import { ROLE_LABELS, auth } from '../store.js';

const PROFILE_PATHS = { staff: '/staff/profile', user: '/user/profile' }; // admin has no profile page

export default {
  name: 'Navbar',
  props: {
    menuOpen: { type: Boolean, default: false },
  },
  emits: ['toggle-menu', 'logout'],
  computed: {
    auth: () => auth,
    roleLabel() {
      return ROLE_LABELS[auth.role] || '';
    },
    profilePath() {
      return PROFILE_PATHS[auth.role] || null;
    },
    pageTitle() {
      return this.$route.meta.title || '';
    },
    initials() {
      const parts = (auth.fullName || '?').trim().split(/\s+/);
      return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    },
  },
  template: `
    <header class="top-bar">
      <button
        type="button"
        class="top-bar__menu d-lg-none"
        aria-controls="app-sidebar"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="Open menu"
        @click="$emit('toggle-menu')"
      >
        <i class="bi bi-list" aria-hidden="true"></i>
      </button>

      <div class="top-bar__titles">
        <span class="top-bar__app d-none d-md-inline">Trekking Management Application</span>
        <span class="top-bar__app d-md-none">TMA</span>
        <span class="top-bar__page">{{ pageTitle }}</span>
      </div>

      <div class="top-bar__actions">
        <!-- Reserved for <NotificationBell /> in Phase 8 -->
        <div class="top-bar__slot" aria-hidden="true"></div>

        <div class="dropdown">
          <button
            type="button"
            class="top-bar__user"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <span class="avatar" aria-hidden="true">{{ initials }}</span>
            <span class="top-bar__who">
              <span class="top-bar__name">{{ auth.fullName }}</span>
              <span class="role-badge" :class="'role-badge--' + auth.role">{{ roleLabel }}</span>
            </span>
            <i class="bi bi-chevron-down small" aria-hidden="true"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li class="dropdown-header d-sm-none">{{ auth.fullName }} · {{ roleLabel }}</li>
            <li v-if="profilePath">
              <router-link class="dropdown-item" :to="profilePath">
                <i class="bi bi-person-circle me-2" aria-hidden="true"></i>Profile
              </router-link>
            </li>
            <li v-if="profilePath"><hr class="dropdown-divider"></li>
            <li>
              <button type="button" class="dropdown-item" @click="$emit('logout')">
                <i class="bi bi-box-arrow-right me-2" aria-hidden="true"></i>Logout
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>
  `,
};
