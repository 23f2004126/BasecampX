/**
 * A card with one Chart.js chart and a "Table" toggle (the same numbers as a
 * table, for screen readers and anyone who prefers exact values).
 *
 * <ChartCard title="Bookings per month" kind="line" :labels="[...]" :values="[...]" />
 * kind: 'bar' | 'hbar' (horizontal bars) | 'line' | 'doughnut'
 * colors: for doughnut, one colour per label (keyed by label, so a colour
 *         always belongs to the same category, never to its rank).
 *
 * Chart.js is loaded from the CDN the first time any chart is shown, so pages
 * without charts (like the login screen) never download it.
 */
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js';
let chartJsLoading = null;

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  chartJsLoading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: CHART_JS_URL, async: true });
    script.onload = () => resolve(window.Chart);
    script.onerror = () => {
      chartJsLoading = null;
      reject(new Error('Could not load the chart library.'));
    };
    document.head.appendChild(script);
  });
  return chartJsLoading;
}

// Theme tokens for chart chrome (text never uses the data colour)
const INK = '#4b5e54';       // axis + legend text (moss)
const GRID = '#e4e7dc';      // hairline gridlines
const SURFACE = '#ffffff';   // card surface: gaps between slices, rings on dots
const SERIES = '#26372e';    // single-series bars (forest)
const LINE = '#1f97ad';      // single-series line (teal)

export default {
  name: 'ChartCard',
  props: {
    title: { type: String, required: true },
    kind: { type: String, default: 'bar' },
    labels: { type: Array, default: () => [] },
    values: { type: Array, default: () => [] },
    colors: { type: Object, default: () => ({}) },
    valueLabel: { type: String, default: 'Bookings' },
    loading: { type: Boolean, default: false }, // new data is on its way: spinner over the chart
  },
  data() {
    return { showTable: false, error: '' };
  },
  computed: {
    isEmpty() {
      return !this.values.some((v) => v > 0);
    },
  },
  watch: {
    labels: 'render',
    values: 'render',
    showTable(table) {
      if (!table) this.$nextTick(this.render);
    },
  },
  mounted() {
    this.render();
  },
  beforeUnmount() {
    this.renderId = -1; // a render still waiting must not draw any more
    this.removeChart();
  },
  methods: {
    removeChart() {
      this.chart?.destroy();
      this.chart = null;
    },

    // Called for each change of labels or values, so two calls can overlap.
    // renderId lets only the newest call draw: one canvas never gets two charts.
    async render() {
      this.renderId = (this.renderId || 0) + 1;
      const id = this.renderId;

      if (this.isEmpty || this.showTable) {
        this.removeChart();
        return;
      }
      let Chart;
      try {
        Chart = await loadChartJs();
      } catch (error) {
        this.error = error.message;
        return;
      }
      await this.$nextTick();
      if (id !== this.renderId) return; // a newer render took over
      const canvas = this.$refs.canvas;
      if (!canvas) return; // switched to table / unmounted meanwhile

      const next = this.config();
      if (this.chart?.canvas === canvas) {
        // Same canvas: update in place, so the chart animates to the new numbers.
        this.chart.data = next.data;
        this.chart.update();
      } else {
        // The canvas was rebuilt (back from the table or the empty state).
        this.removeChart();
        this.chart = new Chart(canvas, next);
      }
    },

    config() {
      const font = { family: 'Inter, system-ui, sans-serif', size: 12 };
      // Plain copies: Chart.js keeps these arrays, and they shouldn't be Vue's reactive ones.
      const labels = [...this.labels];
      const values = [...this.values];
      const tooltip = {
        backgroundColor: '#16211b',
        padding: 10,
        cornerRadius: 8,
        titleFont: { ...font, weight: '600' },
        bodyFont: font,
        displayColors: this.kind === 'doughnut',
      };
      const base = {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 },
        plugins: { legend: { display: false }, tooltip },
      };

      if (this.kind === 'doughnut') {
        return {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: labels.map((l) => this.colors[l] || SERIES),
              borderColor: SURFACE,
              borderWidth: 2, // the 2px surface gap between slices
              hoverOffset: 6,
            }],
          },
          options: {
            ...base,
            cutout: '62%',
            plugins: {
              ...base.plugins,
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  color: INK, font, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14,
                  // "Open (2)" - identity and value never rely on colour alone
                  generateLabels: (chart) => chart.data.labels.map((label, i) => ({
                    text: `${label} (${chart.data.datasets[0].data[i]})`,
                    fillStyle: chart.data.datasets[0].backgroundColor[i],
                    strokeStyle: chart.data.datasets[0].backgroundColor[i],
                    fontColor: INK,
                    hidden: !chart.getDataVisibility(i),
                    index: i,
                  })),
                },
              },
            },
          },
        };
      }

      const horizontal = this.kind === 'hbar';
      const isLine = this.kind === 'line';
      const valueAxis = {
        beginAtZero: true,
        ticks: { color: INK, font, precision: 0 },
        grid: { color: GRID },
        border: { display: false },
      };
      const categoryAxis = {
        // A long date range gives many months: the line chart may skip some labels.
        ticks: { color: INK, font, autoSkip: isLine, maxRotation: 0 },
        grid: { display: false },
        border: { color: GRID },
      };

      return {
        type: isLine ? 'line' : 'bar',
        data: {
          labels,
          datasets: [{
            label: this.valueLabel,
            data: values,
            ...(isLine
              ? {
                  borderColor: LINE,
                  borderWidth: 2,
                  backgroundColor: 'rgba(31, 151, 173, 0.10)', // ~10% area wash
                  fill: true,
                  tension: 0.3,
                  cubicInterpolationMode: 'monotone', // smooth, but never dips below 0
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  pointBackgroundColor: LINE,
                  pointBorderColor: SURFACE, // 2px surface ring
                  pointBorderWidth: 2,
                }
              : {
                  backgroundColor: SERIES,
                  borderRadius: 4,
                  borderSkipped: 'start', // rounded data end, square at the baseline
                  maxBarThickness: 24,
                }),
          }],
        },
        options: {
          ...base,
          indexAxis: horizontal ? 'y' : 'x',
          interaction: isLine ? { mode: 'index', intersect: false } : { mode: 'nearest', intersect: true },
          scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
        },
      };
    },
  },
  template: `
    <section class="panel chart-card h-100" :aria-busy="loading ? 'true' : 'false'">
      <div v-if="loading" class="chart-card__loading" role="status">
        <span class="spinner-border" aria-hidden="true"></span>
        <span class="visually-hidden">Loading {{ title }}…</span>
      </div>

      <header class="chart-card__head">
        <h2 class="panel__title mb-0">{{ title }}</h2>
        <button
          v-if="!isEmpty"
          type="button"
          class="btn btn-sm btn-outline-primary chart-card__toggle"
          :aria-pressed="showTable ? 'true' : 'false'"
          @click="showTable = !showTable"
        >
          <i class="bi" :class="showTable ? 'bi-bar-chart' : 'bi-table'" aria-hidden="true"></i>
          {{ showTable ? 'Chart' : 'Table' }}
        </button>
      </header>

      <p v-if="isEmpty" class="chart-card__empty">No data for these dates.</p>
      <p v-else-if="error" class="chart-card__empty">{{ error }}</p>

      <div v-else-if="showTable" class="chart-card__table">
        <table class="table table-sm table-theme">
          <thead><tr><th scope="col">{{ kind === 'doughnut' ? 'Status' : 'Item' }}</th><th scope="col" class="text-end">{{ valueLabel }}</th></tr></thead>
          <tbody>
            <tr v-for="(label, i) in labels" :key="label">
              <td>
                <span v-if="colors[label]" class="chart-card__swatch" :style="{ background: colors[label] }" aria-hidden="true"></span>
                {{ label }}
              </td>
              <td class="text-end fw-semibold">{{ values[i] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="chart-card__canvas" :class="'chart-card__canvas--' + kind">
        <canvas ref="canvas" role="img" :aria-label="title + ' chart. Use the Table button for the exact numbers.'"></canvas>
      </div>
    </section>
  `,
};
