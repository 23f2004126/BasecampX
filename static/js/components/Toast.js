/**
 * Global toast notifications.
 *
 * Any file can do:
 *     import { toast } from '../components/Toast.js';
 *     toast.success('Booking confirmed!');
 *     toast.error('Something went wrong', { title: 'Payment failed' });
 * and inside templates/options API: this.$toast.info('...')  (registered in app.js)
 *
 * The <ToastHost /> component (default export) is mounted once in app.js and
 * renders whatever is in the shared reactive list.
 */
import { reactive } from 'vue';

const state = reactive({ items: [] });
let nextId = 1;

const ICONS = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-octagon-fill',
  info: 'bi-info-circle-fill',
};

export function dismiss(id) {
  const index = state.items.findIndex((t) => t.id === id);
  if (index !== -1) state.items.splice(index, 1);
}

function show(type, message, { title = '', timeout = 4000 } = {}) {
  const id = nextId++;
  state.items.push({ id, type, message, title });
  if (state.items.length > 4) state.items.shift(); // never bury the screen
  if (timeout) setTimeout(() => dismiss(id), timeout);
  return id;
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, { timeout: 6000, ...options }),
  info: (message, options) => show('info', message, options),
  dismiss,
};

export default {
  name: 'ToastHost',
  data() {
    return { state, icons: ICONS };
  },
  methods: { dismiss },
  template: `
    <div class="toast-stack" aria-live="polite" aria-relevant="additions">
      <TransitionGroup name="toast">
        <div
          v-for="t in state.items"
          :key="t.id"
          class="tma-toast"
          :class="'tma-toast--' + t.type"
          :role="t.type === 'error' ? 'alert' : 'status'"
        >
          <i class="bi tma-toast__icon" :class="icons[t.type]" aria-hidden="true"></i>
          <div class="tma-toast__body">
            <strong v-if="t.title" class="tma-toast__title">{{ t.title }}</strong>
            <span>{{ t.message }}</span>
          </div>
          <button type="button" class="tma-toast__close" aria-label="Dismiss notification" @click="dismiss(t.id)">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
      </TransitionGroup>
    </div>
  `,
};
