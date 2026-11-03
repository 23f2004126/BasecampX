/**
 * App entry point: creates the Vue app, plugs in the router and the global
 * toast host, and mounts on <div id="app"> in templates/index.html.
 */
import { createApp } from 'vue';
import router from './router.js';
import ToastHost, { toast } from './components/Toast.js';

const App = {
  components: { ToastHost },
  template: `
    <router-view />
    <ToastHost />
  `,
};

const app = createApp(App);
app.config.globalProperties.$toast = toast; // this.$toast.success('...') in any component
app.use(router);
app.mount('#app');
