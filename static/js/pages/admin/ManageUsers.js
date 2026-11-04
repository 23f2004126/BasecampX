/** Users (Trekkers) (wireframe screen 7). The table lives in PeopleList. */
import PeopleList from '../../components/PeopleList.js';

export default {
  name: 'ManageUsers',
  components: { PeopleList },
  template: `
    <section>
      <h1 class="page-title mb-4">Users (Trekkers)</h1>
      <PeopleList kind="users" />
    </section>
  `,
};
