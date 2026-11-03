/**
 * Admin > Settings (sidebar item from wireframe screens 3-7).
 * - Account: the admin's details from GET /api/me
 * - Preferences: saved in this browser (store.js prefs)
 * - About: how the system is configured
 */
import Loader from '../../components/Loader.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { PER_PAGE_OPTIONS, ROLE_LABELS, prefs, setPref } from '../../store.js';
import { formatDate } from '../../utils/format.js';

export default {
  name: 'AdminSettings',
  components: { Loader },
  data() {
    return { me: null, prefs, perPageOptions: PER_PAGE_OPTIONS, roleLabels: ROLE_LABELS };
  },
  async mounted() {
    try {
      this.me = await get('/me');
    } catch (error) {
      toast.error(error.message);
    }
  },
  methods: {
    formatDate,
    toggleSidebar(event) {
      setPref('sidebarCollapsed', event.target.checked);
      toast.success(event.target.checked ? 'Sidebar will show icons only.' : 'Sidebar will show full labels.');
    },
    changePerPage(event) {
      setPref('perPage', Number(event.target.value));
      toast.success(`Tables will show ${event.target.value} rows per page.`);
    },
  },
  template: `
    <section>
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Your account and how the admin panel behaves in this browser.</p>

      <div class="row g-4">
        <div class="col-lg-6 stagger" style="--i: 0">
          <div class="panel h-100">
            <h2 class="panel__title"><i class="bi bi-person-badge me-2 text-moss" aria-hidden="true"></i>Account</h2>
            <Loader v-if="!me" label="Loading your account…" />
            <dl v-else class="detail-list">
              <div><dt>Name</dt><dd>{{ me.full_name }}</dd></div>
              <div><dt>Email</dt><dd>{{ me.email }}</dd></div>
              <div><dt>Contact</dt><dd>{{ me.contact_number || '—' }}</dd></div>
              <div><dt>Role</dt><dd><span class="role-badge role-badge--admin">{{ roleLabels[me.role] }}</span></dd></div>
              <div><dt>Admin since</dt><dd>{{ formatDate(me.created_at) }}</dd></div>
            </dl>
          </div>
        </div>

        <div class="col-lg-6 stagger" style="--i: 1">
          <div class="panel h-100">
            <h2 class="panel__title"><i class="bi bi-sliders me-2 text-moss" aria-hidden="true"></i>Preferences</h2>
            <div class="form-check form-switch mb-3">
              <input id="pref-sidebar" class="form-check-input" type="checkbox" role="switch"
                     :checked="prefs.sidebarCollapsed" @change="toggleSidebar">
              <label class="form-check-label" for="pref-sidebar">Compact sidebar (icons only)</label>
            </div>
            <label for="pref-per-page" class="form-label fw-semibold">Rows per page in tables</label>
            <select id="pref-per-page" class="form-select" :value="prefs.perPage" @change="changePerPage">
              <option v-for="n in perPageOptions" :key="n" :value="n">{{ n }} rows</option>
            </select>
            <p class="form-text mb-0">Saved in this browser only.</p>
          </div>
        </div>

        <div class="col-12 stagger" style="--i: 2">
          <div class="panel">
            <h2 class="panel__title"><i class="bi bi-info-circle me-2 text-moss" aria-hidden="true"></i>About the system</h2>
            <dl class="detail-list detail-list--wide">
              <div><dt>Login sessions</dt><dd>Expire after 24 hours, or when the user logs out.</dd></div>
              <div><dt>Who can register</dt><dd>Only Users (Trekkers). Trekking Staff are created by Admin.</dd></div>
              <div><dt>Blacklisting</dt><dd>Blacklisted users and staff cannot login or use the system.</dd></div>
              <div><dt>Admin account</dt><dd>Created by <code>create_initial_data.py</code> from <code>ADMIN_EMAIL</code> / <code>ADMIN_PASSWORD</code>.</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  `,
};
