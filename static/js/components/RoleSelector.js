/**
 * Admin / Trek Staff / Trekker picker.
 * Usage: <RoleSelector v-model="role" />   (role is 'admin' | 'staff' | 'user')
 *
 * - Tiles flip in one after another (CSS animation with a per-tile delay).
 * - One highlight pill sits behind the tiles and slides to the selected one
 *   (translateX by the tile index), instead of each tile changing colour.
 * - Keyboard: it's a radio group, so arrow keys move the selection.
 */
const ROLES = [
  { value: 'admin', label: 'Admin', icon: 'bi-shield-lock' },
  { value: 'staff', label: 'Trekking Staff', icon: 'bi-compass' },
  { value: 'user', label: 'User (Trekker)', icon: 'bi-backpack2' },
];

export default {
  name: 'RoleSelector',
  props: {
    modelValue: { type: String, default: 'user' },
  },
  emits: ['update:modelValue'],
  data() {
    return { roles: ROLES };
  },
  computed: {
    selectedIndex() {
      return Math.max(0, this.roles.findIndex((r) => r.value === this.modelValue));
    },
  },
  methods: {
    select(value) {
      this.$emit('update:modelValue', value);
    },
    onKey(event) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (this.selectedIndex + step + this.roles.length) % this.roles.length;
      this.select(this.roles[next].value);
      this.$nextTick(() => this.$refs.tiles[next].focus());
    },
  },
  template: `
    <div class="role-selector" role="radiogroup" aria-label="Roles" @keydown="onKey">
      <span
        class="role-selector__highlight"
        :style="{ transform: 'translateX(calc(' + selectedIndex + ' * (100% + var(--role-gap))))' }"
        aria-hidden="true"
      ></span>
      <button
        v-for="(role, i) in roles"
        :key="role.value"
        ref="tiles"
        type="button"
        role="radio"
        class="role-tile"
        :class="{ 'is-selected': role.value === modelValue }"
        :style="{ '--i': i }"
        :aria-checked="role.value === modelValue ? 'true' : 'false'"
        :tabindex="role.value === modelValue ? 0 : -1"
        @click="select(role.value)"
      >
        <i class="bi" :class="role.icon" aria-hidden="true"></i>
        <span>{{ role.label }}</span>
      </button>
    </div>
  `,
};
