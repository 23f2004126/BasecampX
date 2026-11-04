/**
 * "Install app" item in the Navbar user menu.
 *
 * Browsers fire beforeinstallprompt once the app can be installed, often before
 * the user has logged in and this menu exists, so the event is captured as soon
 * as this module loads. The item shows only while that event is available, and
 * browsers don't fire it for an app that's already installed.
 */
import { reactive } from 'vue';

const install = reactive({ event: null });

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // we offer our own menu item instead of the browser's banner
  install.event = event;
});
window.addEventListener('appinstalled', () => {
  install.event = null;
});

export default {
  name: 'InstallPrompt',
  data: () => ({ install }),
  methods: {
    start() {
      const { event } = install;
      install.event = null; // each event can only be used once
      event.prompt();
    },
  },
  template: `
    <li v-if="install.event">
      <button type="button" class="dropdown-item" @click="start">
        <i class="bi bi-download me-2" aria-hidden="true"></i>Install app
      </button>
    </li>
  `,
};
