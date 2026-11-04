/**
 * My Bookings: tabs Upcoming / Cancelled / Waitlist.
 *   Upcoming  : GET /api/user/bookings?status=Booked     (Pay now, Cancel)
 *   Cancelled : GET /api/user/bookings?status=Cancelled
 *   Waitlist  : GET /api/user/waitlist                   (Leave)
 * After every change the current tab is re-fetched from the API.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import Pagination from '../../components/Pagination.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { toast } from '../../components/Toast.js';
import { del, get, put } from '../../api.js';
import { prefs } from '../../store.js';
import { badgeClass, formatDate, formatMoney, formatRange } from '../../utils/format.js';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'waitlist', label: 'Waitlist' },
];

export default {
  name: 'MyBookings',
  components: { Loader, EmptyState, Pagination },
  data() {
    const tab = TABS.some((t) => t.key === this.$route.query.tab) ? this.$route.query.tab : 'upcoming';
    return { tabs: TABS, tab, rows: [], page: 1, pages: 1, loading: true, busyId: null, now: Date.now() };
  },
  mounted() {
    this.load();
    this.timer = setInterval(() => (this.now = Date.now()), 30000); // refresh "x min left"
  },
  beforeUnmount() {
    clearInterval(this.timer);
  },
  methods: {
    badgeClass,
    formatDate,
    formatMoney,
    formatRange,

    switchTab(key) {
      if (key === this.tab) return;
      this.tab = key;
      this.$router.replace({ query: key === 'upcoming' ? {} : { tab: key } });
      this.load(1);
    },

    async load(page = 1) {
      this.loading = true;
      try {
        if (this.tab === 'waitlist') {
          const data = await get('/user/waitlist');
          Object.assign(this, { rows: data.items, page: 1, pages: 1 });
        } else {
          const status = this.tab === 'upcoming' ? 'Booked' : 'Cancelled';
          const data = await get(`/user/bookings?status=${status}&page=${page}&per_page=${prefs.perPage}`);
          Object.assign(this, { rows: data.items, page: data.page, pages: data.pages });
        }
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },

    minutesLeft(b) {
      return Math.max(0, Math.ceil((new Date(b.payment_due_at) - this.now) / 60000));
    },

    canCancel(b) {
      const startsOn = new Date(`${b.trek.start_date}T00:00:00`);
      return !['Ongoing', 'Completed'].includes(b.trek.status) && startsOn > new Date();
    },

    async cancel(b) {
      const paid = b.payment_status === 'Paid';
      const ok = await confirmDialog({
        title: 'Cancel this booking?',
        message: `${b.trek_name}, ${formatRange(b.trek.start_date, b.trek.end_date)}.`
          + (paid ? ` ${formatMoney(b.amount)} will be refunded.` : ''),
        confirmText: 'Cancel booking', cancelText: 'Keep booking', tone: 'danger',
      });
      if (!ok) return;
      this.busyId = b.id;
      try {
        const res = await put(`/bookings/${b.id}/cancel`);
        toast.success(`${res.message} 1 slot restored on ${b.trek_name}.`, { title: 'Booking cancelled' });
        await this.load(this.page);
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.busyId = null;
      }
    },

    async leave(entry) {
      const ok = await confirmDialog({
        title: 'Leave the waitlist?', message: `You'll lose your place for ${entry.trek_name}.`,
        confirmText: 'Leave waitlist', tone: 'danger',
      });
      if (!ok) return;
      this.busyId = entry.id;
      try {
        const res = await del(`/treks/${entry.trek_id}/waitlist`);
        toast.info(res.message);
        await this.load();
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.busyId = null;
      }
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-3">My Bookings</h1>

      <div class="tabs" role="tablist" aria-label="Booking lists">
        <button v-for="t in tabs" :key="t.key" type="button" role="tab" class="tabs__tab"
                :class="{ 'is-active': tab === t.key }" :aria-selected="tab === t.key ? 'true' : 'false'"
                @click="switchTab(t.key)">{{ t.label }}</button>
      </div>

      <Loader v-if="loading" label="Loading…" />

      <EmptyState v-else-if="!rows.length && tab === 'upcoming'" title="No upcoming bookings"
                  message="Your next adventure is one click away." action-label="Browse treks" action-to="/user/treks" icon="bi-compass" />
      <EmptyState v-else-if="!rows.length && tab === 'cancelled'" title="No cancelled bookings" message="Nice - nothing cancelled so far." />
      <EmptyState v-else-if="!rows.length" title="You're not on any waitlist"
                  message="When a trek is full, you can join its waitlist from the trek page." />

      <div v-else-if="tab === 'upcoming'" class="panel p-0 p-md-2">
        <table class="table table-theme table-hover table-stack">
          <thead>
            <tr><th>Trek Name</th><th>Booking Date</th><th>Trek Dates</th><th>Amount</th><th>Payment</th><th>Status</th><th class="text-end">Action</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in rows" :key="b.id" class="stagger" :style="{ '--i': i }">
              <td data-label="Trek Name" class="fw-semibold">{{ b.trek_name }}</td>
              <td data-label="Booking Date">{{ formatDate(b.booking_date) }}</td>
              <td data-label="Trek Dates">{{ formatRange(b.trek.start_date, b.trek.end_date) }}</td>
              <td data-label="Amount">{{ formatMoney(b.amount) }}</td>
              <td data-label="Payment">
                <span :class="badgeClass(b.payment_status)">{{ b.payment_status }}</span>
                <span v-if="b.payment_status === 'Pending'" class="d-block small text-danger mt-1">{{ minutesLeft(b) }} min left to pay</span>
              </td>
              <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
              <td class="td-actions text-end text-nowrap">
                <router-link v-if="b.payment_status === 'Pending'" :to="'/user/checkout/' + b.id" class="btn btn-sm btn-primary">Pay now</router-link>
                <router-link :to="'/user/treks/' + b.trek_id" class="btn btn-sm btn-outline-primary ms-1">View Details</router-link>
                <button v-if="canCancel(b)" type="button" class="btn btn-sm btn-outline-danger ms-1" :disabled="busyId === b.id" @click="cancel(b)">Cancel</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="tab === 'cancelled'" class="panel p-0 p-md-2">
        <table class="table table-theme table-hover table-stack">
          <thead>
            <tr><th>Trek Name</th><th>Trek Dates</th><th>Cancelled On</th><th>Amount</th><th>Refund</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in rows" :key="b.id" class="stagger" :style="{ '--i': i }">
              <td data-label="Trek Name" class="fw-semibold">
                <router-link :to="'/user/treks/' + b.trek_id">{{ b.trek_name }}</router-link>
              </td>
              <td data-label="Trek Dates">{{ formatRange(b.trek.start_date, b.trek.end_date) }}</td>
              <td data-label="Cancelled On">{{ formatDate(b.cancelled_at) }}</td>
              <td data-label="Amount">{{ formatMoney(b.amount) }}</td>
              <td data-label="Refund">
                <span v-if="b.payment_status === 'Refunded'" :class="badgeClass('refunded')">Refunded</span>
                <span v-else class="text-moss small">Not charged</span>
              </td>
              <td data-label="Status"><span :class="badgeClass(b.status)">{{ b.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="panel p-0 p-md-2">
        <table class="table table-theme table-hover table-stack">
          <thead>
            <tr><th>Trek Name</th><th>Trek Starts</th><th>Position</th><th>Status</th><th class="text-end">Action</th></tr>
          </thead>
          <tbody>
            <tr v-for="(w, i) in rows" :key="w.id" class="stagger" :style="{ '--i': i }">
              <td data-label="Trek Name" class="fw-semibold">{{ w.trek_name }}</td>
              <td data-label="Trek Starts">{{ formatDate(w.trek_start_date) }}</td>
              <td data-label="Position">{{ w.position ? '#' + w.position : '—' }}</td>
              <td data-label="Status"><span :class="badgeClass(w.status === 'Waiting' ? 'pending' : w.status === 'Promoted' ? 'booked' : 'closed')">{{ w.status }}</span></td>
              <td class="td-actions text-end text-nowrap">
                <router-link :to="'/user/treks/' + w.trek_id" class="btn btn-sm btn-outline-primary">View trek</router-link>
                <button v-if="w.status === 'Waiting'" type="button" class="btn btn-sm btn-outline-danger ms-1" :disabled="busyId === w.id" @click="leave(w)">Leave</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && pages > 1" class="d-flex justify-content-end mt-3">
        <Pagination :page="page" :pages="pages" @change="load" />
      </div>
    </section>
  `,
};
