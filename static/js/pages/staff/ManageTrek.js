/**
 * Staff > Manage Trek (wireframe screen 9).
 *   GET /api/staff/treks/<id>             details + participants
 *   GET /api/staff/treks/<id>/waitlist    who is waiting
 *   PUT /api/staff/treks/<id>             {available_slots, status: Open|Closed}  ("Update Trek")
 *   PUT /api/staff/treks/<id>/start       Open/Closed -> Ongoing
 *   PUT /api/staff/treks/<id>/complete    Ongoing -> Completed ("Mark as Completed")
 * Every action re-fetches the trek from the API.
 */
import Loader from '../../components/Loader.js';
import EmptyState from '../../components/EmptyState.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { toast } from '../../components/Toast.js';
import { get, put } from '../../api.js';
import { badgeClass, formatDate } from '../../utils/format.js';

const PREVIEW = 8; // participants shown here; the rest via "View All Participants"

export default {
  name: 'ManageTrek',
  components: { Loader, EmptyState },
  data: () => ({ loading: true, error: '', trek: null, waitlist: [], form: { available_slots: 0, status: '' }, busy: false, preview: PREVIEW }),
  computed: {
    trekId() {
      return Number(this.$route.params.id);
    },
    booked() {
      return this.trek.participants.filter((p) => p.booking_status === 'Booked').length;
    },
    maxFree() {
      return this.trek.total_slots - this.booked;
    },
    canEditStatus() {
      return ['Approved', 'Open', 'Closed'].includes(this.trek.status);
    },
    canEdit() {
      return !['Ongoing', 'Completed'].includes(this.trek.status);
    },
    changed() {
      return this.form.available_slots !== this.trek.available_slots || (this.canEditStatus && this.form.status !== this.trek.status);
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    badgeClass,
    formatDate,
    async load() {
      try {
        const [trek, waitlist] = await Promise.all([get(`/staff/treks/${this.trekId}`), get(`/staff/treks/${this.trekId}/waitlist`)]);
        this.trek = trek;
        this.waitlist = waitlist.items;
        this.form = { available_slots: trek.available_slots, status: trek.status };
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async update() {
      const slots = Number(this.form.available_slots);
      if (!Number.isInteger(slots) || slots < 0 || slots > this.maxFree) {
        toast.error(`Available slots must be between 0 and ${this.maxFree}.`);
        return;
      }
      const body = { available_slots: slots };
      if (this.canEditStatus && ['Open', 'Closed'].includes(this.form.status) && this.form.status !== this.trek.status) body.status = this.form.status;
      this.busy = true;
      try {
        const res = await put(`/staff/treks/${this.trekId}`, body);
        toast.success('Trek updated.' + (res.promoted_from_waitlist ? ` ${res.promoted_from_waitlist} trekker(s) moved up from the waitlist.` : ''));
        await this.load();
      } catch (error) {
        toast.error(error.errors ? Object.values(error.errors).join(' ') : error.message);
      } finally {
        this.busy = false;
      }
    },
    async transition(action) {
      const start = action === 'start';
      const ok = await confirmDialog(start
        ? { title: `Start ${this.trek.name}?`, message: `The ${this.booked} booked trekkers will be notified. The waitlist closes.`, confirmText: 'Start Trek' }
        : { title: `Mark ${this.trek.name} as completed?`, message: 'All active bookings become Completed, and trekkers can review it and download certificates.', confirmText: 'Mark as Completed' });
      if (!ok) return;
      this.busy = true;
      try {
        const res = await put(`/staff/treks/${this.trekId}/${action}`);
        toast.success(start ? 'Trek started. Trekkers were notified.' : `Trek completed. ${res.bookings_completed} booking(s) marked completed.`);
        await this.load();
      } catch (error) {
        toast.error(error.message);
      } finally {
        this.busy = false;
      }
    },
  },
  template: `
    <section>
      <router-link to="/staff/treks" class="back-link"><i class="bi bi-arrow-left"></i> Back to My Treks</router-link>
      <Loader v-if="loading" label="Loading trek…" />
      <EmptyState v-else-if="error" title="Can't open this trek" :message="error" action-label="My Treks" action-to="/staff/treks" />

      <template v-else>
        <div class="page-head">
          <h1 class="page-title mb-0">{{ trek.name }} <span :class="badgeClass(trek.status)" class="align-middle fs-6">{{ trek.status }}</span></h1>
        </div>

        <div class="row g-4">
          <div class="col-lg-5">
            <form class="panel stagger" novalidate @submit.prevent="update">
              <h2 class="panel__title">Trek Details</h2>
              <dl class="detail-list">
                <div><dt>Location</dt><dd>{{ trek.location }}</dd></div>
                <div><dt>Difficulty</dt><dd>{{ trek.difficulty }}</dd></div>
                <div><dt>Duration</dt><dd>{{ trek.duration_days }} Days</dd></div>
                <div><dt>Start Date</dt><dd>{{ formatDate(trek.start_date) }}</dd></div>
                <div><dt>End Date</dt><dd>{{ formatDate(trek.end_date) }}</dd></div>
                <div><dt>Total Slots</dt><dd>{{ trek.total_slots }}</dd></div>
              </dl>
              <div class="row g-3 mt-1">
                <div class="col-6">
                  <label for="mt-slots" class="form-label">Available Slots</label>
                  <input id="mt-slots" v-model.number="form.available_slots" type="number" min="0" :max="maxFree" class="form-control" :disabled="!canEdit">
                  <div class="form-text">0 – {{ maxFree }}</div>
                </div>
                <div class="col-6">
                  <label for="mt-status" class="form-label">Status</label>
                  <select id="mt-status" v-model="form.status" class="form-select" :disabled="!canEditStatus">
                    <option v-if="!['Open', 'Closed'].includes(trek.status)" :value="trek.status">{{ trek.status }}</option>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              <div class="d-grid gap-2 mt-4">
                <button type="submit" class="btn btn-primary" :disabled="busy || !canEdit || !changed">Update Trek</button>
                <button v-if="['Open', 'Closed'].includes(trek.status)" type="button" class="btn btn-outline-primary" :disabled="busy" @click="transition('start')">
                  <i class="bi bi-play-fill me-1"></i>Start Trek
                </button>
                <button type="button" class="btn btn-outline-success" :disabled="busy || trek.status !== 'Ongoing'" @click="transition('complete')">
                  <i class="bi bi-check2-circle me-1"></i>Mark as Completed
                </button>
              </div>
            </form>
          </div>

          <div class="col-lg-7">
            <div class="panel mb-4 stagger" style="--i: 1">
              <h2 class="panel__title">Participants ({{ trek.participant_count }})</h2>
              <p v-if="!trek.participants.length" class="text-moss mb-0">No one has booked this trek yet.</p>
              <template v-else>
                <table class="table table-theme table-sm table-stack">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Booking Date</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr v-for="(p, i) in trek.participants.slice(0, preview)" :key="p.booking_id">
                      <td data-label="#">{{ i + 1 }}</td>
                      <td data-label="Name" class="fw-semibold">{{ p.full_name }}</td>
                      <td data-label="Email">{{ p.email }}</td>
                      <td data-label="Booking Date">{{ formatDate(p.booking_date) }}</td>
                      <td data-label="Status"><span :class="badgeClass(p.booking_status)">{{ p.booking_status }}</span></td>
                    </tr>
                  </tbody>
                </table>
                <div class="text-end">
                  <router-link :to="{ path: '/staff/participants', query: { trek: String(trek.id) } }" class="fw-semibold">View All Participants <i class="bi bi-arrow-right"></i></router-link>
                </div>
              </template>
            </div>

            <div class="panel stagger" style="--i: 2">
              <h2 class="panel__title">Waitlist ({{ waitlist.length }})</h2>
              <p v-if="!waitlist.length" class="text-moss mb-0">Nobody is waiting for this trek.</p>
              <table v-else class="table table-theme table-sm table-stack mb-0">
                <thead><tr><th>Position</th><th>Name</th><th>Email</th><th>Joined</th></tr></thead>
                <tbody>
                  <tr v-for="w in waitlist" :key="w.id">
                    <td data-label="Position">#{{ w.position }}</td>
                    <td data-label="Name" class="fw-semibold">{{ w.user_name }}</td>
                    <td data-label="Email">{{ w.user_email }}</td>
                    <td data-label="Joined">{{ formatDate(w.created_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </section>
  `,
};
