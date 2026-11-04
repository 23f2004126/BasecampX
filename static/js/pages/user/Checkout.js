/**
 * Checkout: pay for a held seat.
 *   GET  /api/user/bookings/<id>   booking + trek + payment_due_at
 *   POST /api/payments             {booking_id, method, card_number?}
 * The countdown is the 30-minute hold; after it the seat is released.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import PaymentModal from '../../components/PaymentModal.js';
import TrekImage from '../../components/TrekImage.js';
import { toast } from '../../components/Toast.js';
import { get, post } from '../../api.js';
import { formatMoney, formatRange } from '../../utils/format.js';

const METHODS = [
  { value: 'UPI', label: 'UPI', icon: 'bi-phone' },
  { value: 'Card', label: 'Card', icon: 'bi-credit-card' },
  { value: 'NetBanking', label: 'Net Banking', icon: 'bi-bank' },
];
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank'];

export default {
  name: 'Checkout',
  components: { Loader, EmptyState, PaymentModal, TrekImage },
  data() {
    return {
      loading: true,
      booking: null,
      error: '',
      methods: METHODS,
      banks: BANKS,
      method: 'UPI',
      upi: '',
      card: { number: '', expiry: '', cvv: '' },
      bank: '',
      errors: {},
      now: Date.now(),
      modal: null,
      reference: '',
      failMessage: '',
    };
  },
  computed: {
    secondsLeft() {
      if (!this.booking?.payment_due_at) return 0;
      return Math.max(0, Math.floor((new Date(this.booking.payment_due_at) - this.now) / 1000));
    },
    countdown() {
      const s = this.secondsLeft;
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },
    payable() {
      return this.booking && this.booking.status === 'Booked' && this.booking.payment_status === 'Pending' && this.secondsLeft > 0;
    },
  },
  mounted() {
    this.load();
    this.timer = setInterval(() => (this.now = Date.now()), 1000);
  },
  beforeUnmount() {
    clearInterval(this.timer);
  },
  methods: {
    formatMoney,
    formatRange,
    async load() {
      try {
        this.booking = await get(`/user/bookings/${this.$route.params.bookingId}`);
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    formatCard(e) {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
      this.card.number = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    },
    formatExpiry(e) {
      const d = e.target.value.replace(/\D/g, '').slice(0, 4);
      this.card.expiry = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    },
    validate() {
      const e = {};
      if (this.method === 'UPI' && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(this.upi.trim())) e.upi = 'Enter a UPI ID like name@bank.';
      if (this.method === 'Card') {
        if (!/^\d{12,19}$/.test(this.card.number.replace(/\s/g, ''))) e.number = 'Enter a valid card number.';
        const m = this.card.expiry.match(/^(\d{2})\/(\d{2})$/);
        if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiry = 'Use MM/YY.';
        if (!/^\d{3,4}$/.test(this.card.cvv)) e.cvv = '3 or 4 digits.';
      }
      if (this.method === 'NetBanking' && !this.bank) e.bank = 'Choose your bank.';
      this.errors = e;
      return !Object.keys(e).length;
    },
    async pay() {
      if (!this.validate()) return;
      this.modal = 'processing';
      const body = { booking_id: this.booking.id, method: this.method };
      if (this.method === 'Card') body.card_number = this.card.number.replace(/\s/g, '');
      try {
        const res = await post('/payments', body);
        this.reference = res.payment.transaction_ref;
        this.modal = 'success';
        toast.success(`Booking confirmed for ${this.booking.trek_name}.`);
      } catch (error) {
        if (error.status === 402) {
          this.failMessage = error.message;
          this.modal = 'failed';
        } else {
          this.modal = null;
          toast.error(error.message);
        }
        await this.load(); // status may have changed (e.g. window expired)
      }
    },
    done() {
      this.modal = null;
      this.$router.push('/user/bookings');
    },
  },
  template: `
    <section>
      <Loader v-if="loading" label="Loading your booking…" />
      <EmptyState v-else-if="error" title="Booking not found" :message="error" action-label="My bookings" action-to="/user/bookings" />

      <template v-else>
        <h1 class="page-title mb-4">Checkout</h1>

        <EmptyState v-if="booking.payment_status === 'Paid'" title="Already paid"
                    message="This booking is confirmed." action-label="My bookings" action-to="/user/bookings" />
        <EmptyState v-else-if="!payable" title="This seat is no longer held"
                    :message="booking.status === 'Cancelled' ? 'The booking was cancelled.' : 'The 30-minute payment window has ended.'"
                    action-label="Back to the trek" :action-to="'/user/treks/' + booking.trek_id" />

        <div v-else class="row g-4">
          <div class="col-lg-7">
            <form class="panel stagger" novalidate @submit.prevent="pay">
              <h2 class="panel__title">Payment method</h2>
              <div class="pay-methods" role="radiogroup" aria-label="Payment method">
                <label v-for="m in methods" :key="m.value" class="pay-method" :class="{ 'is-selected': method === m.value }">
                  <input v-model="method" type="radio" name="method" :value="m.value" class="visually-hidden">
                  <i class="bi" :class="m.icon" aria-hidden="true"></i> {{ m.label }}
                </label>
              </div>

              <div v-if="method === 'UPI'" class="mb-3">
                <label for="pay-upi" class="form-label">UPI ID</label>
                <input id="pay-upi" v-model="upi" class="form-control" :class="{ 'is-invalid': errors.upi }" placeholder="name@okbank" autocomplete="off">
                <div class="invalid-feedback">{{ errors.upi }}</div>
              </div>

              <div v-else-if="method === 'Card'" class="row g-3 mb-3">
                <div class="col-12">
                  <label for="pay-card" class="form-label">Card number</label>
                  <input id="pay-card" :value="card.number" class="form-control" :class="{ 'is-invalid': errors.number }"
                         inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" @input="formatCard">
                  <div class="invalid-feedback">{{ errors.number }}</div>
                  <div class="form-text">Test mode: cards ending in 0000 are declined.</div>
                </div>
                <div class="col-6">
                  <label for="pay-exp" class="form-label">Expiry</label>
                  <input id="pay-exp" :value="card.expiry" class="form-control" :class="{ 'is-invalid': errors.expiry }"
                         inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" @input="formatExpiry">
                  <div class="invalid-feedback">{{ errors.expiry }}</div>
                </div>
                <div class="col-6">
                  <label for="pay-cvv" class="form-label">CVV</label>
                  <input id="pay-cvv" v-model="card.cvv" type="password" class="form-control" :class="{ 'is-invalid': errors.cvv }"
                         inputmode="numeric" maxlength="4" autocomplete="cc-csc">
                  <div class="invalid-feedback">{{ errors.cvv }}</div>
                </div>
              </div>

              <div v-else class="mb-3">
                <label for="pay-bank" class="form-label">Bank</label>
                <select id="pay-bank" v-model="bank" class="form-select" :class="{ 'is-invalid': errors.bank }">
                  <option value="">Choose your bank</option>
                  <option v-for="b in banks" :key="b" :value="b">{{ b }}</option>
                </select>
                <div class="invalid-feedback">{{ errors.bank }}</div>
              </div>

              <button type="submit" class="btn btn-summit btn-lg w-100" :disabled="modal === 'processing'">
                Pay {{ formatMoney(booking.amount) }}
              </button>
            </form>
          </div>

          <aside class="col-lg-5">
            <div class="panel stagger" style="--i: 1">
              <div class="checkout-summary__image"><TrekImage :trek="booking.trek" /></div>
              <h2 class="panel__title mb-1">{{ booking.trek_name }}</h2>
              <p class="text-moss mb-3">{{ booking.trek.location }} · {{ formatRange(booking.trek.start_date, booking.trek.end_date) }}</p>
              <dl class="detail-list">
                <div><dt>Booking ID</dt><dd>#{{ booking.id }}</dd></div>
                <div><dt>Travellers</dt><dd>1</dd></div>
                <div><dt>Total</dt><dd class="fs-5">{{ formatMoney(booking.amount) }}</dd></div>
              </dl>
              <p class="hold-timer" :class="{ 'is-urgent': secondsLeft < 300 }" role="timer" aria-live="off">
                <i class="bi bi-clock" aria-hidden="true"></i> Seat held for <strong>{{ countdown }}</strong>
              </p>
            </div>
          </aside>
        </div>
      </template>

      <PaymentModal :state="modal" :amount="booking ? booking.amount : 0" :reference="reference" :message="failMessage"
                    @retry="modal = null" @done="done" />
    </section>
  `,
};
