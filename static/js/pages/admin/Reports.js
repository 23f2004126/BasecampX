/**
 * Admin > Reports: six charts for one date range.
 *
 *   Charts : GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   PDF    : GET /api/admin/reports/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The range comes from the From / To inputs, a preset, or the month picker.
 * Those are three ways to set the same two values, `from` and `to`, so the
 * charts and the PDF can never disagree about the dates.
 */
import ChartCard from '../../components/ChartCard.js';
import Loader from '../../components/Loader.js';
import { toast } from '../../components/Toast.js';
import { download, get } from '../../api.js';

// Validated categorical palette for trek statuses (fixed per status, never by rank):
// adjacent slices incl. the wrap-around pass colour-blind separation (ΔE ≥ 11.7).
const STATUS_COLORS = {
  Pending: '#d19a00',
  Approved: '#6a55d0',
  Open: '#1f97ad',
  Closed: '#c0533a',
  Ongoing: '#2a6fc9',
  Completed: '#2f8a4f',
};

const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' });
const TYPING_PAUSE_MS = 350;  // a date being typed is "valid" after each digit: wait for a pause
const EARLIEST_YEAR = '2000'; // same limit as the API; also skips half-typed years like 0020

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// YYYY-MM-DD in the user's own timezone (toISOString would give the UTC day).
function dayKey(date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

// Every preset ends today; `start` gets today and returns the first day of the range.
const PRESETS = [
  { label: 'This month', start: (d) => new Date(d.getFullYear(), d.getMonth(), 1) },
  { label: 'Last 3 months', start: (d) => new Date(d.getFullYear(), d.getMonth() - 2, 1) },
  { label: 'Last 6 months', start: (d) => new Date(d.getFullYear(), d.getMonth() - 5, 1) },
  { label: 'This year', start: (d) => new Date(d.getFullYear(), 0, 1) },
];

export default {
  name: 'AdminReports',
  components: { ChartCard, Loader },
  data() {
    const now = new Date();
    return {
      loading: true,
      report: null,
      statusColors: STATUS_COLORS,
      presets: PRESETS,
      today: dayKey(now),
      maxMonth: monthKey(now),
      from: dayKey(PRESETS[2].start(now)), // Last 6 months, the API's default too
      to: dayKey(now),
      downloading: false,
    };
  },
  computed: {
    monthLabels() {
      // '2026-06' -> 'Jun 2026'
      return (this.report?.bookings_per_month.labels || [])
        .map((key) => MONTH_FMT.format(new Date(`${key}-01T00:00:00`)));
    },
    rangeError() {
      return this.from && this.to && this.from > this.to ? 'From must be on or before To.' : '';
    },
    rangeReady() {
      return Boolean(this.from && this.to && !this.rangeError && this.from >= EARLIEST_YEAR);
    },
    // The month picker: shows a month when the range is exactly that month.
    month: {
      get() {
        const key = this.from.slice(0, 7);
        return this.monthRange(key)?.from === this.from && this.monthRange(key)?.to === this.to ? key : '';
      },
      set(key) {
        const range = this.monthRange(key);
        if (range) this.setRange(range.from, range.to);
      },
    },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    clearTimeout(this.typingTimer);
  },
  methods: {
    // 'YYYY-MM' -> the first and last day of that month (never later than today)
    monthRange(key) {
      if (!/^\d{4}-\d{2}$/.test(key)) return null;
      const [year, month] = key.split('-').map(Number);
      const last = dayKey(new Date(year, month, 0)); // day 0 of next month = last day of this one
      return { from: `${key}-01`, to: last < this.today ? last : this.today };
    },

    presetFrom(preset) {
      return dayKey(preset.start(new Date(`${this.today}T00:00:00`)));
    },
    isActive(preset) {
      return this.from === this.presetFrom(preset) && this.to === this.today;
    },

    setRange(from, to) {
      clearTimeout(this.typingTimer);
      this.from = from;
      this.to = to;
      this.load();
    },
    dateTyped() {
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(this.load, TYPING_PAUSE_MS);
    },

    async load() {
      if (!this.rangeReady) return;
      // If the range changes again before this answer arrives, the answer is thrown away.
      this.requestId = (this.requestId || 0) + 1;
      const id = this.requestId;
      this.loading = true;
      try {
        const report = await get(`/admin/reports?from=${this.from}&to=${this.to}`);
        if (id === this.requestId) this.report = report;
      } catch (error) {
        if (id === this.requestId) toast.error(error.message);
      } finally {
        if (id === this.requestId) this.loading = false;
      }
    },

    async downloadPdf() {
      if (!this.rangeReady) return;
      const { from, to } = this;
      this.downloading = true;
      try {
        await download(`/admin/reports/pdf?from=${from}&to=${to}`, `tma-report-${from}_to_${to}.pdf`);
        toast.success(`Report for ${from} to ${to} downloaded.`);
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.downloading = false;
      }
    },
  },
  template: `
    <section>
      <div class="page-head">
        <h1 class="page-title mb-0">Reports</h1>
        <form class="report-export" @submit.prevent="downloadPdf">
          <label for="report-month" class="visually-hidden">Report month</label>
          <input id="report-month" v-model="month" type="month" class="form-control" :max="maxMonth">
          <button type="submit" class="btn btn-primary text-nowrap" :disabled="downloading || !rangeReady">
            <span v-if="downloading" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            <i v-else class="bi bi-file-earmark-pdf me-1" aria-hidden="true"></i>
            Download PDF report
          </button>
        </form>
      </div>

      <div class="report-range">
        <button v-for="p in presets" :key="p.label" type="button" class="btn btn-sm text-nowrap"
                :class="isActive(p) ? 'btn-primary' : 'btn-outline-primary'"
                :aria-pressed="isActive(p) ? 'true' : 'false'"
                @click="setRange(presetFrom(p), today)">{{ p.label }}</button>
        <label class="report-range__field">From
          <input id="report-from" v-model="from" type="date" class="form-control form-control-sm"
                 min="2000-01-01" :max="today" @change="dateTyped">
        </label>
        <label class="report-range__field">To
          <input id="report-to" v-model="to" type="date" class="form-control form-control-sm"
                 min="2000-01-01" :max="today" @change="dateTyped">
        </label>
        <span v-if="rangeError" class="text-danger small" role="alert">{{ rangeError }}</span>
      </div>

      <!-- The big loader is only for the first load. After that the charts stay
           mounted and each one shows its own spinner while new data arrives. -->
      <Loader v-if="loading && !report" label="Crunching the numbers…" />

      <div v-else-if="report" class="row g-4">
        <div class="col-lg-6 stagger" style="--i: 0">
          <ChartCard title="Top 5 popular treks" kind="hbar" :loading="loading"
                     :labels="report.bookings_per_trek.labels" :values="report.bookings_per_trek.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 1">
          <ChartCard title="Bookings per month" kind="line" :loading="loading"
                     :labels="monthLabels" :values="report.bookings_per_month.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 2">
          <ChartCard title="Treks by status" kind="doughnut" value-label="Treks" :colors="statusColors" :loading="loading"
                     :labels="report.treks_by_status.labels" :values="report.treks_by_status.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 3">
          <ChartCard title="Bookings by difficulty" kind="bar" value-label="Trekkers" :loading="loading"
                     :labels="report.users_by_difficulty.labels" :values="report.users_by_difficulty.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 4">
          <ChartCard title="Average rating per trek" kind="hbar" value-label="Avg rating" :loading="loading"
                     :labels="report.avg_rating_per_trek.labels" :values="report.avg_rating_per_trek.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 5">
          <ChartCard title="Waitlist demand" kind="hbar" value-label="People waiting" :loading="loading"
                     :labels="report.waitlist_demand.labels" :values="report.waitlist_demand.data" />
        </div>
      </div>
    </section>
  `,
};
