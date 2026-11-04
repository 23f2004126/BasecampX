/**
 * Trek card (wireframe screens 10 and 11).
 *
 * <TrekCard :trek="trek" action="book" @book="startBooking(trek)" />   (dashboard: Book Now)
 * <TrekCard :trek="trek" action="details" />                           (browse: View Details)
 *
 * The Book button reads "Not Available" (disabled) when the trek isn't Open
 * or has no seats left. "Slots Left" turns red at 3 or fewer.
 */
import TrekImage from './TrekImage.js';
import { badgeClass, formatMoney } from '../utils/format.js';

export default {
  name: 'TrekCard',
  components: { TrekImage },
  props: {
    trek: { type: Object, required: true },
    action: { type: String, default: 'details' }, // 'book' | 'details'
  },
  emits: ['book'],
  computed: {
    available() {
      return this.trek.status === 'Open' && this.trek.available_slots > 0;
    },
    detailsLink() {
      return `/user/treks/${this.trek.id}`;
    },
  },
  methods: { badgeClass, formatMoney },
  template: `
    <article class="trek-card">
      <router-link :to="detailsLink" class="trek-card__media" tabindex="-1" aria-hidden="true">
        <TrekImage :trek="trek" />
        <span v-if="trek.avg_rating" class="trek-card__rating"><i class="bi bi-star-fill"></i> {{ trek.avg_rating }}</span>
      </router-link>
      <div class="trek-card__body">
        <h3 class="trek-card__name"><router-link :to="detailsLink">{{ trek.name }}</router-link></h3>
        <p class="trek-card__location"><i class="bi bi-geo-alt" aria-hidden="true"></i> {{ trek.location }}</p>
        <p class="trek-card__meta">
          <span :class="badgeClass(trek.difficulty)">{{ trek.difficulty }}</span>
          <span>{{ trek.duration_days }} Days</span>
          <span class="trek-card__price">{{ formatMoney(trek.price) }}</span>
        </p>
        <p class="trek-card__slots" :class="{ 'is-low': trek.available_slots <= 3 }">
          Slots Left: <strong>{{ trek.available_slots }}</strong>
        </p>
        <button v-if="action === 'book'" type="button" class="btn w-100"
                :class="available ? 'btn-outline-primary' : 'btn-light'" :disabled="!available" @click="$emit('book', trek)">
          {{ available ? 'Book Now' : 'Not Available' }}
        </button>
        <router-link v-else :to="detailsLink" class="btn btn-outline-primary w-100">View Details</router-link>
      </div>
    </article>
  `,
};
