/**
 * Admin > Reports: four charts from GET /api/admin/reports, plus the monthly
 * report as a PDF (GET /api/admin/reports/pdf?month=YYYY-MM, same report the
 * Celery job emails on the 1st of each month).
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

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default {
  name: 'AdminReports',
  components: { ChartCard, Loader },
  data() {
    const now = new Date();
    return {
      loading: true,
      report: null,
      statusColors: STATUS_COLORS,
      month: monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), // last month
      maxMonth: monthKey(now),
      downloading: false,
    };
  },
  computed: {
    monthLabels() {
      // '2026-06' -> 'Jun 2026'
      return (this.report?.bookings_per_month.labels || [])
        .map((key) => MONTH_FMT.format(new Date(`${key}-01T00:00:00`)));
    },
  },
  async mounted() {
    try {
      this.report = await get('/admin/reports');
    } catch (error) {
      toast.error(error.message);
    } finally {
      this.loading = false;
    }
  },
  methods: {
    async downloadPdf() {
      if (!this.month) return;
      this.downloading = true;
      try {
        await download(`/admin/reports/pdf?month=${this.month}`, `tma-report-${this.month}.pdf`);
        toast.success(`Report for ${this.month} downloaded.`);
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
          <input id="report-month" v-model="month" type="month" class="form-control" :max="maxMonth" required>
          <button type="submit" class="btn btn-primary text-nowrap" :disabled="downloading || !month">
            <span v-if="downloading" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            <i v-else class="bi bi-file-earmark-pdf me-1" aria-hidden="true"></i>
            Download PDF report
          </button>
        </form>
      </div>

      <Loader v-if="loading" label="Crunching the numbers…" />

      <div v-else-if="report" class="row g-4">
        <div class="col-lg-6 stagger" style="--i: 0">
          <ChartCard title="Top 5 popular treks" kind="hbar"
                     :labels="report.bookings_per_trek.labels" :values="report.bookings_per_trek.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 1">
          <ChartCard title="Bookings per month" kind="line"
                     :labels="monthLabels" :values="report.bookings_per_month.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 2">
          <ChartCard title="Treks by status" kind="doughnut" value-label="Treks" :colors="statusColors"
                     :labels="report.treks_by_status.labels" :values="report.treks_by_status.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 3">
          <ChartCard title="Bookings by difficulty" kind="bar" value-label="Trekkers"
                     :labels="report.users_by_difficulty.labels" :values="report.users_by_difficulty.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 4">
          <ChartCard title="Average rating per trek" kind="hbar" value-label="Avg rating"
                     :labels="report.avg_rating_per_trek.labels" :values="report.avg_rating_per_trek.data" />
        </div>
        <div class="col-lg-6 stagger" style="--i: 5">
          <ChartCard title="Waitlist demand" kind="hbar" value-label="People waiting"
                     :labels="report.waitlist_demand.labels" :values="report.waitlist_demand.data" />
        </div>
      </div>
    </section>
  `,
};
