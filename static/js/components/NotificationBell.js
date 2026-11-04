/**
 * Notification bell in the Navbar (all roles).
 *   GET /api/notifications/unread-count   every 30s, and right after booking,
 *                                         paying, cancelling or waitlist actions
 *   GET /api/notifications?per_page=8     when the dropdown opens
 *   PUT /api/notifications/<id>/read      on click, then go to its link
 *   PUT /api/notifications/read-all       "Mark all as read"
 * The bell shakes when the unread count goes up.
 */
import { DATA_CHANGED_EVENT, get, put } from '../api.js';
import { toast } from './Toast.js';
import { timeAgo } from '../utils/format.js';

const POLL_EVERY_MS = 30000;
const LATEST = 8;
const TYPE_ICONS = {
  booking: 'bi-calendar-check',
  payment: 'bi-credit-card',
  waitlist: 'bi-hourglass-split',
  trek: 'bi-signpost-split',
  system: 'bi-info-circle',
};

export default {
  name: 'NotificationBell',
  data() {
    return { unread: null, open: false, items: [], loading: false, shaking: false };
  },
  computed: {
    badge() {
      return this.unread > 99 ? '99+' : this.unread;
    },
    label() {
      return this.unread ? `Notifications, ${this.unread} unread` : 'Notifications';
    },
  },
  watch: {
    '$route.fullPath'() {
      this.open = false;
    },
    unread(now, before) {
      if (before !== null && now > before) this.shake(); // not on the first load
      if (this.open && before !== null && now !== before) this.loadList();
    },
  },
  mounted() {
    this.refreshCount();
    this.timer = setInterval(() => {
      if (!document.hidden) this.refreshCount(); // no polling from background tabs
    }, POLL_EVERY_MS);
    window.addEventListener(DATA_CHANGED_EVENT, this.refreshCount);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('pointerdown', this.onOutside);
  },
  beforeUnmount() {
    clearInterval(this.timer);
    window.removeEventListener(DATA_CHANGED_EVENT, this.refreshCount);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerdown', this.onOutside);
  },
  methods: {
    timeAgo,
    icon: (type) => TYPE_ICONS[type] || TYPE_ICONS.system,

    async refreshCount() {
      try {
        this.unread = (await get('/notifications/unread-count')).unread;
      } catch {
        /* a missed poll isn't worth interrupting the user; the next one retries */
      }
    },
    onVisibility() {
      if (!document.hidden) this.refreshCount();
    },
    onOutside(event) {
      if (this.open && !this.$el.contains(event.target)) this.open = false;
    },
    shake() {
      this.shaking = false;
      requestAnimationFrame(() => (this.shaking = true)); // re-adding the class restarts it
    },
    toggle() {
      this.open = !this.open;
      if (this.open) this.loadList();
    },
    closeAndRefocus() {
      this.open = false;
      this.$refs.bell.focus();
    },
    async loadList() {
      this.loading = !this.items.length;
      try {
        const data = await get(`/notifications?per_page=${LATEST}`);
        this.items = data.items;
        this.unread = data.unread;
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },
    async openItem(note) {
      this.open = false;
      if (!note.is_read) {
        try {
          this.unread = (await put(`/notifications/${note.id}/read`)).unread;
          note.is_read = true;
        } catch (error) {
          toast.error(error.message);
        }
      }
      if (note.link) this.$router.push(note.link);
    },
    async markAll() {
      try {
        this.unread = (await put('/notifications/read-all')).unread;
        await this.loadList();
      } catch (error) {
        toast.error(error.message);
      }
    },
  },
  template: `
    <div class="notif" @keydown.esc="closeAndRefocus">
      <button ref="bell" type="button" class="notif__bell" :class="{ 'is-shaking': shaking }" :aria-label="label"
              aria-haspopup="true" :aria-expanded="open ? 'true' : 'false'"
              @click="toggle" @animationend="shaking = false">
        <i class="bi bi-bell" aria-hidden="true"></i>
        <span v-if="unread" class="notif__badge" aria-hidden="true">{{ badge }}</span>
      </button>

      <div v-if="open" class="notif__menu" role="dialog" aria-label="Notifications">
        <header class="notif__head">
          <h2 class="notif__title">Notifications</h2>
          <button v-if="unread" type="button" class="notif__mark-all" @click="markAll">Mark all as read</button>
        </header>
        <p v-if="loading" class="notif__empty">Loading…</p>
        <div v-else-if="!items.length" class="notif__empty">
          <i class="bi bi-bell-slash" aria-hidden="true"></i>
          <p class="mb-0">No notifications yet</p>
        </div>
        <ul v-else class="notif__list">
          <li v-for="n in items" :key="n.id">
            <button type="button" class="notif__item" :class="{ 'is-unread': !n.is_read }" @click="openItem(n)">
              <span class="notif__icon" aria-hidden="true"><i class="bi" :class="icon(n.type)"></i></span>
              <span class="notif__body">
                <span class="notif__item-title">{{ n.title }}<span v-if="!n.is_read" class="visually-hidden"> (unread)</span></span>
                <span class="notif__message">{{ n.message }}</span>
                <span class="notif__time">{{ timeAgo(n.created_at) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  `,
};
