/**
 * Friendly placeholder for empty lists.
 *
 * <EmptyState
 *   title="No bookings yet"
 *   message="Your next adventure is one click away."
 *   action-label="Browse treks"
 *   action-to="/user/treks"        (router link)   -- or listen to @action instead
 * />
 */
export default {
  name: 'EmptyState',
  props: {
    title: { type: String, default: 'Nothing here yet' },
    message: { type: String, default: '' },
    actionLabel: { type: String, default: '' },
    actionTo: { type: [String, Object], default: null },
    icon: { type: String, default: '' }, // optional Bootstrap icon on the button
  },
  emits: ['action'],
  template: `
    <div class="empty-state">
      <svg class="empty-state__art" viewBox="0 0 200 130" role="img" aria-hidden="true">
        <circle cx="156" cy="30" r="12" fill="var(--sand)"/>
        <circle cx="161" cy="26" r="11" fill="var(--cloud)"/>
        <path d="M0 112 L52 44 L84 82 L118 34 L200 112 Z" fill="var(--mist)" opacity="0.6"/>
        <path d="M0 130 L0 104 Q50 92 100 102 T200 98 L200 130 Z" fill="var(--moss)"/>
        <!-- tent -->
        <path d="M78 110 L100 76 L122 110 Z" fill="var(--summit)"/>
        <path d="M100 76 L94 110 L106 110 Z" fill="var(--forest)" opacity="0.85"/>
        <line x1="100" y1="76" x2="100" y2="70" stroke="var(--forest)" stroke-width="2" stroke-linecap="round"/>
        <!-- campfire -->
        <path class="empty-state__flame" d="M138 110 Q134 102 140 96 Q141 103 145 104 Q147 108 144 110 Z" fill="var(--summit)"/>
        <line x1="132" y1="111" x2="150" y2="108" stroke="var(--clay)" stroke-width="3" stroke-linecap="round"/>
        <line x1="132" y1="108" x2="150" y2="111" stroke="var(--clay)" stroke-width="3" stroke-linecap="round"/>
      </svg>
      <h2 class="empty-state__title">{{ title }}</h2>
      <p v-if="message" class="empty-state__message">{{ message }}</p>
      <template v-if="actionLabel">
        <router-link v-if="actionTo" :to="actionTo" class="btn btn-primary">
          <i v-if="icon" class="bi me-1" :class="icon" aria-hidden="true"></i>{{ actionLabel }}
        </router-link>
        <button v-else type="button" class="btn btn-primary" @click="$emit('action')">
          <i v-if="icon" class="bi me-1" :class="icon" aria-hidden="true"></i>{{ actionLabel }}
        </button>
      </template>
    </div>
  `,
};
