/**
 * "My Assigned Treks" table (wireframe screen 8), shared by My Dashboard and My Treks.
 * Columns: Trek Name, Dates, Participants, Slots, Status, Action (Manage / View).
 */
import { badgeClass, formatRange } from '../utils/format.js';

export default {
  name: 'StaffTrekTable',
  props: { treks: { type: Array, required: true } },
  methods: {
    badgeClass,
    formatRange,
    canManage: (t) => t.status !== 'Completed',
  },
  template: `
    <div class="panel p-0 p-md-2">
      <table class="table table-theme table-hover table-stack">
        <thead><tr><th>Trek Name</th><th>Dates</th><th>Participants</th><th>Slots</th><th>Status</th><th class="text-end">Action</th></tr></thead>
        <tbody>
          <tr v-for="(t, i) in treks" :key="t.id" class="stagger" :style="{ '--i': i }">
            <td data-label="Trek Name" class="fw-semibold">{{ t.name }}</td>
            <td data-label="Dates">{{ formatRange(t.start_date, t.end_date) }}</td>
            <td data-label="Participants">{{ t.participant_count }}</td>
            <td data-label="Slots" :class="{ 'text-danger fw-semibold': t.available_slots <= 3 && t.status === 'Open' }">{{ t.available_slots }} / {{ t.total_slots }}</td>
            <td data-label="Status"><span :class="badgeClass(t.status)">{{ t.status }}</span></td>
            <td class="td-actions text-end">
              <router-link :to="'/staff/treks/' + t.id" class="btn btn-sm" :class="canManage(t) ? 'btn-primary' : 'btn-outline-primary'">
                {{ canManage(t) ? 'Manage' : 'View' }}
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
};
