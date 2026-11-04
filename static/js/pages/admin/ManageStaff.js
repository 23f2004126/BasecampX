/** Trekking Staff List (wireframe screen 6). The table lives in PeopleList. */
import PeopleList from '../../components/PeopleList.js';

export default {
  name: 'ManageStaff',
  components: { PeopleList },
  template: `
    <section>
      <div class="page-head">
        <h1 class="page-title mb-0">Trekking Staff List</h1>
        <router-link to="/admin/staff/new" class="btn btn-primary"><i class="bi bi-plus-lg me-1"></i>Create Staff</router-link>
      </div>
      <PeopleList kind="staff" />
    </section>
  `,
};
