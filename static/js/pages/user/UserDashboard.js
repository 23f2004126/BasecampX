/**
 * Trekker dashboard (wireframe screen 10).
 *   Available Treks : GET /api/treks?difficulty=&location=&per_page=6  (+ GET /api/treks/locations)
 *   My Bookings     : GET /api/user/bookings?status=Booked&per_page=5
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import TrekCard from '../../components/TrekCard.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { auth } from '../../store.js';
import { startBooking } from '../../utils/booking.js';
import { badgeClass, formatDate, formatRange } from '../../utils/format.js';
import { TREK_DIFFICULTIES } from '../../utils/constants.js';
import { refreshMyTreks } from '../../utils/waitlist.js';

export default {
  name: 'UserDashboard',
  components: { Loader, EmptyState, TrekCard },
  data() {
    return {
      difficulties: TREK_DIFFICULTIES,
      difficulty: '',
      location: '',
      locations: [],
      treks: [],
      loadingTreks: true,
      bookings: [],
      loadingBookings: true,
    };
  },
  computed: {
    firstName() {
      return (auth.fullName || 'trekker').split(' ')[0];
    },
  },
  watch: {
    difficulty: 'loadTreks',
    location: 'loadTreks',
  },
  mounted() {
    this.loadTreks();
    this.loadBookings();
    refreshMyTreks();
    get('/treks/locations').then((d) => (this.locations = d.locations)).catch(() => {});
  },
  methods: {
    badgeClass,
    formatDate,
    formatRange,
    async loadTreks() {
      this.loadingTreks = true;
      const params = new URLSearchParams({ per_page: 6 });
      if (this.difficulty) params.set('difficulty', this.difficulty);
      if (this.location) params.set('location', this.location);
      try {
        this.treks = (await get(`/treks?${params}`)).items;
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loadingTreks = false;
      }
    },
    async loadBookings() {
      this.loadingBookings = true;
      try {
        this.bookings = (await get('/user/bookings?status=Booked&per_page=5')).items;
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.loadingBookings = false;
      }
    },
    async book(trek) {
      await startBooking(trek, this.$router);
    },
  },
  template: `
    <section>
      <h1 class="page-title mb-4">Welcome, {{ firstName }}!</h1>

      <div class="page-head">
        <h2 class="section-title mb-0">Available Treks</h2>
        <div class="filter-bar">
          <select v-model="difficulty" class="form-select filter-bar__select" aria-label="Difficulty">
            <option value="">Difficulty: All</option>
            <option v-for="d in difficulties" :key="d" :value="d">{{ d }}</option>
          </select>
          <select v-model="location" class="form-select filter-bar__select" aria-label="Location">
            <option value="">Location: All</option>
            <option v-for="l in locations" :key="l" :value="l">{{ l }}</option>
          </select>
        </div>
      </div>

      <Loader v-if="loadingTreks" label="Finding treks…" />
      <EmptyState v-else-if="!treks.length" title="No treks match" message="Try another difficulty or location." />
      <div v-else class="trek-grid mb-5">
        <TrekCard v-for="(t, i) in treks" :key="t.id" :trek="t" action="book" class="stagger" :style="{ '--i': i }" @book="book" />
      </div>

      <h2 class="section-title">My Bookings</h2>
      <Loader v-if="loadingBookings" label="Loading your bookings…" />
      <EmptyState v-else-if="!bookings.length" title="No upcoming bookings" message="Pick a trek above to get started." />
      <template v-else>
        <div class="panel p-0 p-md-2">
          <table class="table table-theme table-hover table-stack">
            <thead>
              <tr><th>Trek Name</th><th>Booking Date</th><th>Trek Dates</th><th>Status</th><th class="text-end">Action</th></tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in bookings" :key="b.id" class="stagger" :style="{ '--i': i }">
                <td data-label="Trek Name" class="fw-semibold">{{ b.trek_name }}</td>
                <td data-label="Booking Date">{{ formatDate(b.booking_date) }}</td>
                <td data-label="Trek Dates">{{ formatRange(b.trek.start_date, b.trek.end_date) }}</td>
                <td data-label="Status">
                  <span :class="badgeClass(b.status)">{{ b.status }}</span>
                  <span v-if="b.payment_status === 'Pending'" :class="badgeClass('pending')" class="ms-1">Payment due</span>
                </td>
                <td class="td-actions text-end">
                  <router-link v-if="b.payment_status === 'Pending'" :to="'/user/checkout/' + b.id" class="btn btn-sm btn-primary me-1">Complete payment</router-link>
                  <router-link :to="'/user/treks/' + b.trek_id" class="btn btn-sm btn-outline-primary">View Details</router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="text-end mt-2">
          <router-link to="/user/bookings" class="fw-semibold">View All Bookings <i class="bi bi-arrow-right"></i></router-link>
        </div>
      </template>
    </section>
  `,
};
