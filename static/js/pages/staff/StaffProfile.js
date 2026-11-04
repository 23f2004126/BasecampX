/** Staff > Profile: edit details (incl. experience & specialization) and password. */
import AccountForms from '../../components/AccountForms.js';

export default {
  name: 'StaffProfile',
  components: { AccountForms },
  template: `
    <section>
      <h1 class="page-title mb-4">Profile</h1>
      <AccountForms staff-fields />
    </section>
  `,
};
