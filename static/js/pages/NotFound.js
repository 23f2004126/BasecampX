/**
 * Catch-all 404 page (registered last in router.js).
 */
import TrekkerFooter from '../components/TrekkerFooter.js';
import { dashboardPath, isLoggedIn } from '../store.js';

export default {
  name: 'NotFoundPage',
  components: { TrekkerFooter },
  computed: {
    homePath() {
      return isLoggedIn() ? dashboardPath() : '/login';
    },
    homeLabel() {
      return isLoggedIn() ? 'Back to my dashboard' : 'Back to sign in';
    },
  },
  template: `
    <div class="page-shell">
      <main class="not-found">
        <svg class="not-found__art" viewBox="0 0 320 180" role="img" aria-hidden="true">
          <path d="M0 150 L70 60 L110 100 L170 30 L240 110 L280 80 L320 120 L320 180 L0 180 Z" fill="var(--mist)" opacity="0.6"/>
          <path d="M170 30 L156 52 L164 48 L170 56 L177 48 L184 52 Z" fill="var(--cloud)"/>
          <path d="M0 180 L0 146 Q80 128 160 142 T320 136 L320 180 Z" fill="var(--moss)"/>
          <!-- the trail: dashed, ends at the signpost, footprints wander off -->
          <path d="M20 176 Q90 160 130 150" fill="none" stroke="var(--sand)" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>
          <g fill="var(--sand)" opacity="0.8">
            <ellipse cx="196" cy="160" rx="3" ry="1.6"/><ellipse cx="208" cy="156" rx="3" ry="1.6"/>
            <ellipse cx="222" cy="161" rx="3" ry="1.6"/><ellipse cx="236" cy="155" rx="3" ry="1.6"/>
          </g>
          <!-- signpost -->
          <line x1="150" y1="150" x2="150" y2="92" stroke="var(--clay)" stroke-width="5" stroke-linecap="round"/>
          <path class="not-found__sign" d="M128 96 L172 96 L180 104 L172 112 L128 112 Z" fill="var(--summit)"/>
          <text x="152" y="108" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="11" font-weight="600" fill="var(--forest-ink)">404</text>
          <path d="M174 122 L130 122 L122 129 L130 136 L174 136 Z" fill="var(--sand)"/>
          <text x="150" y="133" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="10" font-weight="600" fill="var(--forest)">???</text>
        </svg>

        <p class="not-found__code">Error 404</p>
        <h1 class="not-found__title">Looks like you’ve wandered off the trail</h1>
        <p class="not-found__text">The page you’re looking for doesn’t exist or has moved. Let’s get you back to base camp.</p>
        <router-link :to="homePath" class="btn btn-primary btn-lg">
          <i class="bi bi-signpost-2 me-2" aria-hidden="true"></i>{{ homeLabel }}
        </router-link>
      </main>
      <TrekkerFooter />
    </div>
  `,
};
