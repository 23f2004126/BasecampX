/**
 * Payment progress dialog used by Checkout.
 * state: 'processing' | 'success' | 'failed'
 */
import { formatMoney } from '../utils/format.js';

export default {
  name: 'PaymentModal',
  props: {
    state: { type: String, default: null },
    amount: { type: Number, default: 0 },
    reference: { type: String, default: '' },
    message: { type: String, default: '' },
  },
  emits: ['retry', 'done'],
  watch: {
    state(value) {
      if (value === 'success' || value === 'failed') this.$nextTick(() => this.$refs.action?.focus());
    },
  },
  methods: { formatMoney },
  template: `
    <Transition name="modal">
      <div v-if="state" class="tma-modal">
        <div class="tma-modal__backdrop"></div>
        <div class="tma-modal__dialog tma-modal__dialog--sm text-center" role="dialog" aria-modal="true" aria-live="assertive">
          <template v-if="state === 'processing'">
            <div class="spinner-border text-primary my-3" role="status" aria-hidden="true"></div>
            <h2 class="tma-modal__title">Processing payment…</h2>
            <p class="tma-modal__text">Please don't close this window.</p>
          </template>
          <template v-else-if="state === 'success'">
            <div class="pay-result pay-result--ok" aria-hidden="true"><i class="bi bi-check-lg"></i></div>
            <h2 class="tma-modal__title">Payment successful</h2>
            <p class="tma-modal__text">{{ formatMoney(amount) }} paid · Ref <strong>{{ reference }}</strong></p>
            <button ref="action" type="button" class="btn btn-primary w-100" @click="$emit('done')">View my bookings</button>
          </template>
          <template v-else>
            <div class="pay-result pay-result--fail" aria-hidden="true"><i class="bi bi-x-lg"></i></div>
            <h2 class="tma-modal__title">Payment failed</h2>
            <p class="tma-modal__text">{{ message }}</p>
            <button ref="action" type="button" class="btn btn-primary w-100" @click="$emit('retry')">Try again</button>
          </template>
        </div>
      </div>
    </Transition>
  `,
};
