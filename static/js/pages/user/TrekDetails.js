/**
 * Trek details for trekkers.
 *   GET /api/treks/<id>                     trek
 *   GET /api/user/bookings?status=Booked    do I already have a seat?
 *   GET /api/user/waitlist                  am I waiting?
 *   GET /api/treks/<id>/reviews             reviews + average
 *   (checklist: PackingChecklist -> GET /api/treks/<id>/checklist)
 * Actions: Book (-> Checkout), Complete payment, Join / Leave waitlist.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import PackingChecklist from '../../components/PackingChecklist.js';
import StarRating from '../../components/StarRating.js';
import TrekImage from '../../components/TrekImage.js';
import { toast } from '../../components/Toast.js';
import { get } from '../../api.js';
import { startBooking } from '../../utils/booking.js';
import { badgeClass, formatDate, formatMoney, formatRange } from '../../utils/format.js';
import { joinWaitlist, leaveWaitlist } from '../../utils/waitlist.js';

export default {
  name: 'TrekDetails',
  components: { Loader, EmptyState, PackingChecklist, StarRating, TrekImage },
  data() {
    return {
      loading: true,
      notFound: false,
      trek: null,
      myBooking: null,
      waitEntry: null,
      reviews: [],
      reviewPage: 1,
      reviewPages: 1,
      avgRating: null,
      reviewCount: 0,
      busy: false,
    };
  },
  computed: {
    trekId() {
      return Number(this.$route.params.id);
    },
    seatsTaken() {
      return this.trek.total_slots - this.trek.available_slots;
    },
    state() {
      if (this.myBooking) return this.myBooking.payment_status === 'Pending' ? 'pending' : 'booked';
      if (this.trek.status !== 'Open') return 'closed';
      if (this.trek.available_slots > 0) return 'available';
      return this.waitEntry ? 'waiting' : 'full';
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    badgeClass,
    formatDate,
    formatMoney,
    formatRange,

    async load() {
      try {
        const [trek, bookings, waitlist] = await Promise.all([
          get(`/treks/${this.trekId}`),
          get('/user/bookings?status=Booked&per_page=100'),
          get('/user/waitlist'),
        ]);
        this.trek = trek;
        this.myBooking = bookings.items.find((b) => b.trek_id === this.trekId) || null;
        this.waitEntry = waitlist.items.find((w) => w.trek_id === this.trekId && w.status === 'Waiting') || null;
        if (!this.reviews.length) this.loadReviews(1);
      } catch (error) {
        if (error.status === 404) this.notFound = true;
        else toast.error(error.message);
      } finally {
        this.loading = false;
      }
    },

    async loadReviews(page) {
      try {
        const data = await get(`/treks/${this.trekId}/reviews?page=${page}&per_page=5`);
        this.reviews = page === 1 ? data.items : [...this.reviews, ...data.items];
        Object.assign(this, { reviewPage: data.page, reviewPages: data.pages, avgRating: data.avg_rating, reviewCount: data.review_count });
      } catch (error) {
        toast.error(error.message);
      }
    },

    async book() {
      this.busy = true;
      await startBooking(this.trek, this.$router);
      this.busy = false;
    },

    async join() {
      this.busy = true;
      if (await joinWaitlist(this.trek)) await this.load();
      this.busy = false;
    },

    async leave() {
      this.busy = true;
      if (await leaveWaitlist(this.trek, this.waitEntry.position)) await this.load();
      this.busy = false;
    },
  },
  template: `
    <section>
      <Loader v-if="loading" label="Loading trek…" />
      <EmptyState v-else-if="notFound" title="Trek not found" message="It may have closed or been removed."
                  action-label="Browse treks" action-to="/user/treks" />

      <template v-else-if="trek">
        <router-link to="/user/treks" class="back-link"><i class="bi bi-arrow-left"></i> Back to treks</router-link>

        <header class="trek-hero stagger">
          <TrekImage :trek="trek" />
          <div class="trek-hero__overlay">
            <p class="trek-hero__badges">
              <span :class="badgeClass(trek.difficulty)">{{ trek.difficulty }}</span>
              <span :class="badgeClass(trek.status)">{{ trek.status }}</span>
            </p>
            <h1 class="trek-hero__title">{{ trek.name }}</h1>
            <p class="trek-hero__meta">
              <span><i class="bi bi-geo-alt"></i> {{ trek.location }}</span>
              <span v-if="trek.avg_rating"><i class="bi bi-star-fill"></i> {{ trek.avg_rating }} ({{ trek.review_count }})</span>
            </p>
          </div>
        </header>

        <div class="row g-4">
          <div class="col-lg-8 order-2 order-lg-1">
            <article class="panel mb-4 stagger" style="--i: 1">
              <h2 class="panel__title">About this trek</h2>
              <p class="mb-0 text-prewrap">{{ trek.description || 'No description yet.' }}</p>
            </article>

            <article v-if="trek.instructions" class="panel mb-4 stagger" style="--i: 2">
              <h2 class="panel__title">Instructions</h2>
              <p class="mb-0 text-prewrap">{{ trek.instructions }}</p>
            </article>

            <article class="panel mb-4 stagger" style="--i: 3">
              <h2 class="panel__title">Packing checklist</h2>
              <PackingChecklist :trek-id="trek.id" />
            </article>

            <article class="panel stagger" style="--i: 4">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <h2 class="panel__title mb-0 me-auto">Reviews</h2>
                <template v-if="reviewCount">
                  <StarRating :value="avgRating" />
                  <span class="fw-semibold">{{ avgRating }}</span>
                  <span class="text-moss small">({{ reviewCount }})</span>
                </template>
              </div>
              <p v-if="!reviews.length" class="text-moss mb-0">No reviews yet. Reviews appear after trekkers complete this trek.</p>
              <ul v-else class="review-list">
                <li v-for="r in reviews" :key="r.id" class="review">
                  <div class="review__head">
                    <span class="avatar avatar--sm" aria-hidden="true">{{ (r.user_name || '?')[0] }}</span>
                    <strong>{{ r.user_name }}</strong>
                    <StarRating :value="r.rating" />
                    <span class="text-moss small ms-auto">{{ formatDate(r.created_at) }}</span>
                  </div>
                  <p v-if="r.comment" class="review__text">{{ r.comment }}</p>
                </li>
              </ul>
              <button v-if="reviewPage < reviewPages" type="button" class="btn btn-sm btn-outline-primary"
                      @click="loadReviews(reviewPage + 1)">Show more reviews</button>
            </article>
          </div>

          <aside class="col-lg-4 order-1 order-lg-2">
            <div class="panel booking-panel stagger" style="--i: 1">
              <p class="booking-panel__price">{{ formatMoney(trek.price) }} <span>per person</span></p>
              <dl class="detail-list">
                <div><dt>Dates</dt><dd>{{ formatRange(trek.start_date, trek.end_date) }}</dd></div>
                <div><dt>Duration</dt><dd>{{ trek.duration_days }} days</dd></div>
                <div><dt>Difficulty</dt><dd>{{ trek.difficulty }}</dd></div>
                <div><dt>Trek leader</dt><dd>{{ trek.staff_name || 'To be announced' }}</dd></div>
              </dl>

              <div class="slots">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="fw-semibold" :class="{ 'text-danger': trek.available_slots <= 3 }">{{ trek.available_slots }} of {{ trek.total_slots }} seats left</span>
                  <span class="text-moss">{{ Math.round(seatsTaken / trek.total_slots * 100) }}% booked</span>
                </div>
                <div class="progress" role="progressbar" aria-label="Seats booked" :aria-valuenow="seatsTaken" aria-valuemin="0" :aria-valuemax="trek.total_slots">
                  <div class="progress-bar" :style="{ width: (seatsTaken / trek.total_slots * 100) + '%' }"></div>
                </div>
              </div>

              <button v-if="state === 'available'" type="button" class="btn btn-summit btn-lg w-100" :disabled="busy" @click="book">Book Now</button>
              <router-link v-else-if="state === 'pending'" :to="'/user/checkout/' + myBooking.id" class="btn btn-summit btn-lg w-100">Complete payment</router-link>
              <template v-else-if="state === 'booked'">
                <p class="booking-panel__note"><i class="bi bi-check-circle-fill text-success"></i> You're booked on this trek.</p>
                <router-link to="/user/bookings" class="btn btn-outline-primary w-100">View my bookings</router-link>
              </template>
              <template v-else-if="state === 'full'">
                <p class="booking-panel__note">This trek is full.</p>
                <button type="button" class="btn btn-primary btn-lg w-100" :disabled="busy" @click="join">Join Waitlist</button>
              </template>
              <template v-else-if="state === 'waiting'">
                <p class="booking-panel__note"><i class="bi bi-hourglass-split"></i> <strong>Waitlist #{{ waitEntry.position }}</strong></p>
                <button type="button" class="btn btn-outline-danger w-100" :disabled="busy" @click="leave">Leave waitlist</button>
              </template>
              <button v-else type="button" class="btn btn-light btn-lg w-100" disabled>Not Available</button>
            </div>
          </aside>
        </div>
      </template>
    </section>
  `,
};
