/**
 * "Are you sure?" dialog, usable from anywhere:
 *
 *   import { confirmDialog } from '../components/ConfirmDialog.js';
 *   if (await confirmDialog({ title: 'Cancel booking?', message: '…', confirmText: 'Cancel booking', tone: 'danger' })) { … }
 *
 * <ConfirmHost /> is mounted once in app.js. Escape or the backdrop = cancel.
 */
import { reactive } from 'vue';

const state = reactive({
  open: false, title: '', message: '', confirmText: 'Confirm', cancelText: 'Go back', tone: 'primary', resolve: null,
});

export function confirmDialog(options) {
  if (state.resolve) state.resolve(false); // a new dialog replaces an open one
  return new Promise((resolve) => {
    Object.assign(state, { confirmText: 'Confirm', cancelText: 'Go back', tone: 'primary', message: '' }, options, {
      open: true,
      resolve,
    });
  });
}

function close(answer) {
  state.resolve?.(answer);
  Object.assign(state, { open: false, resolve: null });
}

export default {
  name: 'ConfirmHost',
  data: () => ({ state }),
  watch: {
    'state.open'(open) {
      if (open) {
        this.lastFocus = document.activeElement;
        this.$nextTick(() => this.$refs.confirm?.focus());
      } else {
        this.lastFocus?.focus?.();
      }
    },
  },
  methods: { close },
  template: `
    <Transition name="modal">
      <div v-if="state.open" class="tma-modal" @keydown.esc="close(false)">
        <div class="tma-modal__backdrop" @click="close(false)"></div>
        <div class="tma-modal__dialog tma-modal__dialog--sm" role="alertdialog" aria-modal="true"
             aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <h2 id="confirm-title" class="tma-modal__title">{{ state.title }}</h2>
          <p v-if="state.message" id="confirm-message" class="tma-modal__text">{{ state.message }}</p>
          <div class="tma-modal__actions">
            <button type="button" class="btn btn-outline-primary" @click="close(false)">{{ state.cancelText }}</button>
            <button ref="confirm" type="button" class="btn" :class="state.tone === 'danger' ? 'btn-danger' : 'btn-primary'"
                    @click="close(true)">{{ state.confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  `,
};
