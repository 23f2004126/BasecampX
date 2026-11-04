/**
 * Searchable list of staff or trekkers with Blacklist / Whitelist
 * (wireframe screens 6 and 7). Columns: ID, Name, Email, Contact, Status, Action.
 *
 *   <PeopleList kind="staff" />   GET /api/admin/staff?search=&page=
 *   <PeopleList kind="users" />   GET /api/admin/users?search=&page=
 *   PUT /api/admin/users/<id>/blacklist | whitelist   (then the list is re-fetched)
 */
import Loader from './Loader.js';
import EmptyState from './EmptyState.js';
import Pagination from './Pagination.js';
import { confirmDialog } from './ConfirmDialog.js';
import { toast } from './Toast.js';
import { get, put } from '../api.js';
import { prefs } from '../store.js';

export default {
  name: 'PeopleList',
  components: { Loader, EmptyState, Pagination },
  props: {
    kind: { type: String, required: true }, // 'staff' | 'users'
  },
  data() {
    return { search: '', rows: [], page: 1, pages: 1, total: 0, loading: true, busyId: null };
  },
  computed: {
    isStaff() {
      return this.kind === 'staff';
    },
    prefix() {
      return this.isStaff ? 'TS' : 'U'; // TS001 / U001 like the wireframe
    },
  },
  watch: {
    search() {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.load(1), 350);
    },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    clearTimeout(this.debounce);
  },
  methods: {
    code(id) {
      return `${this.prefix}${String(id).padStart(3, '0')}`;
    },
    async load(page = 1) {
      this.loading = true;
      const params = new URLSearchParams({ page, per_page: prefs.perPage });
      if (this.search.trim()) params.set('search', this.search.trim());
      try {
        const data = await get(`/admin/${this.kind}?${params}`);
        Object.assign(this, { rows: data.items, page: data.page, pages: data.pages, total: data.total });
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
    async setBlacklist(person, blacklist) {
      const ok = await confirmDialog({
        title: `${blacklist ? 'Blacklist' : 'Whitelist'} ${person.full_name}?`,
        message: blacklist
          ? `${person.full_name} won't be able to log in or use the app${this.isStaff ? '' : ', or book treks'}.`
          : `${person.full_name} will be able to log in again.`,
        confirmText: blacklist ? 'Blacklist' : 'Whitelist',
        tone: blacklist ? 'danger' : 'primary',
      });
      if (!ok) return;
      this.busyId = person.id;
      try {
        const res = await put(`/admin/users/${person.id}/${blacklist ? 'blacklist' : 'whitelist'}`);
        toast.success(`${person.full_name}: ${res.message.toLowerCase().replace('user ', '')}`);
        await this.load(this.page);
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.busyId = null;
      }
    },
  },
  template: `
    <div>
      <div class="filter-bar mb-3">
        <div class="input-icon flex-grow-1">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input v-model="search" type="search" class="form-control"
                 :placeholder="isStaff ? 'Search trekking staff…' : 'Search users…'" :aria-label="isStaff ? 'Search staff' : 'Search users'">
        </div>
      </div>

      <Loader v-if="loading" label="Loading…" />
      <EmptyState v-else-if="!rows.length" :title="search ? 'No one matches “' + search + '”' : 'Nobody here yet'"
                  :message="search ? 'Try a name, email or phone number.' : ''" />
      <template v-else>
        <div class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Email</th><th>Contact</th>
                <th v-if="isStaff">Specialization</th><th v-else>Bookings</th>
                <th>Status</th><th class="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in rows" :key="p.id" class="stagger" :style="{ '--i': i }">
                <td data-label="ID" class="text-moss">{{ code(p.id) }}</td>
                <td data-label="Name" class="fw-semibold">{{ p.full_name }}</td>
                <td data-label="Email">{{ p.email }}</td>
                <td data-label="Contact">{{ p.contact_number }}</td>
                <td v-if="isStaff" data-label="Specialization">{{ p.staff_profile?.specialization || '—' }}</td>
                <td v-else data-label="Bookings">{{ p.bookings_count }}</td>
                <td data-label="Status">
                  <span class="badge-soft" :class="p.is_blacklisted ? 'badge-blacklisted' : 'badge-active'">{{ p.is_blacklisted ? 'Blacklisted' : 'Active' }}</span>
                </td>
                <td class="td-actions text-end">
                  <button v-if="p.is_blacklisted" type="button" class="btn btn-sm btn-outline-success" :disabled="busyId === p.id" @click="setBlacklist(p, false)">Whitelist</button>
                  <button v-else type="button" class="btn btn-sm btn-outline-danger" :disabled="busyId === p.id" @click="setBlacklist(p, true)">Blacklist</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-moss small">{{ total }} {{ isStaff ? 'staff' : 'trekker' + (total === 1 ? '' : 's') }}</span>
          <Pagination :page="page" :pages="pages" @change="load" />
        </div>
      </template>
    </div>
  `,
};
