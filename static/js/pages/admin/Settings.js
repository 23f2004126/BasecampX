/**
 * Admin > Settings (sidebar item from wireframe screens 3-7).
 * - Account: edit name / contact and change password (AccountForms -> /api/profile)
 * - Preferences: saved in this browser (store.js prefs)
 */
import AccountForms from '../../components/AccountForms.js';
import { toast } from '../../components/Toast.js';
import { PER_PAGE_OPTIONS, prefs, setPref } from '../../store.js';

export default {
  name: 'AdminSettings',
  components: { AccountForms },
  data() {
    return { prefs, perPageOptions: PER_PAGE_OPTIONS };
  },
  methods: {
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
      <h1 class="page-title mb-4">Settings</h1>
      <h2 class="section-title">Account</h2>
      <AccountForms />

      <h2 class="section-title mt-5">Preferences</h2>
      <div class="panel form-narrow stagger" style="--i: 2">
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
    </section>
  `,
};
