/**
 * Footer for all inner pages: layered mountains with four tiny hikers.
 *
 * The story (one 32s loop, pure SVG + CSS keyframes, see style.css "Trekker footer"):
 *   1. Three hikers walk together; the fourth (the straggler) slowly falls behind.
 *   2. He slows down, wipes his forehead (a sweat drop falls), and sits on a rock.
 *   3. The group stops; the rear teammate turns around and waves.
 *   4. He gets up, jogs to catch up, and they all walk off together.
 *
 * Every animated part uses the same duration (--trek-cycle) and linear timing,
 * so all the keyframe percentages line up like a shared timeline.
 * Positions use % of the footer width, so it works on any screen size.
 * With prefers-reduced-motion everything is shown as one still scene.
 */

// One hiker figure (16x28 px, walking right). Legs are separate groups so
// CSS can swap between walking, standing, running and sitting poses.
const HIKER_BODY = `
  <rect class="h-pack" x="3" y="8" width="4" height="7" rx="1.4"/>
  <circle class="h-head" cx="9" cy="4.6" r="2.7"/>
  <line class="h-torso" x1="9" y1="8.4" x2="9" y2="17"/>
`;
const WALK_LEGS = `
  <line class="h-leg h-leg--a" x1="9" y1="17" x2="9" y2="26.5"/>
  <line class="h-leg h-leg--b" x1="9" y1="17" x2="9" y2="26.5"/>
`;
const STAND_LEGS = `
  <line class="h-limb" x1="9" y1="17" x2="7.6" y2="26.5"/>
  <line class="h-limb" x1="9" y1="17" x2="10.4" y2="26.5"/>
`;
const ARM = `<line class="h-arm" x1="9" y1="10" x2="11.5" y2="15.5"/>`;

function groupHiker(extraClass = '') {
  return `
    <svg class="hiker ${extraClass}" viewBox="0 0 16 28" width="16" height="28" aria-hidden="true">
      <g class="h-figure">
        ${HIKER_BODY}
        <g class="pose-walk">${WALK_LEGS}</g>
        <g class="pose-stand">${STAND_LEGS}</g>
        <g class="h-arm-wrap">${ARM}</g>
      </g>
    </svg>`;
}

const STRAGGLER = `
  <svg class="hiker hiker--straggler" viewBox="0 0 16 28" width="16" height="28" aria-hidden="true">
    <!-- walking / running / standing share the upper body -->
    <g class="pose-upright">
      ${HIKER_BODY}
      <g class="pose-walk">${WALK_LEGS}</g>
      <g class="pose-run">${WALK_LEGS}</g>
      <g class="pose-stand">${STAND_LEGS}</g>
      <g class="h-arm-wrap">${ARM}</g>
      <path class="h-sweat" d="M13.6 2.2 Q12.4 4.4 13.6 5.2 Q14.8 4.4 13.6 2.2 Z"/>
    </g>
    <!-- sitting on the rock: lower body, knees forward -->
    <g class="pose-sit">
      <rect class="h-pack" x="3" y="12" width="4" height="7" rx="1.4"/>
      <circle class="h-head" cx="9.4" cy="8.4" r="2.7"/>
      <line class="h-torso" x1="9" y1="12" x2="8.6" y2="19.5"/>
      <polyline class="h-limb" points="8.6,19.5 13.6,19.5 13.6,26.5" fill="none"/>
      <line class="h-limb" x1="9.4" y1="13.6" x2="12.6" y2="18.2"/>
    </g>
  </svg>`;

export default {
  name: 'TrekkerFooter',
  data() {
    return {
      year: new Date().getFullYear(),
      group: [groupHiker('hiker--waver'), groupHiker(), groupHiker()].join(''),
      straggler: STRAGGLER,
    };
  },
  methods: {
    about() {
      this.$toast?.info('TMA is a trek management app built with Flask and Vue 3.', { title: 'About TMA' });
    },
  },
  template: `
    <footer class="trek-footer">
      <div class="trek-footer__scene" aria-hidden="true">
        <svg class="trek-footer__mountains" viewBox="0 0 1200 70" preserveAspectRatio="none">
          <path class="m-back" d="M0 70 L0 38 L70 18 L140 34 L230 8 L320 30 L400 16 L490 36 L580 10 L660 28 L760 6 L850 30 L930 14 L1020 34 L1110 12 L1200 30 L1200 70 Z"/>
          <path class="m-mid" d="M0 70 L0 46 L90 30 L170 44 L260 26 L350 46 L450 28 L540 44 L640 24 L730 42 L820 30 L910 46 L1010 28 L1100 44 L1200 34 L1200 70 Z"/>
          <path class="m-front" d="M0 70 L0 58 Q150 50 300 57 T600 56 T900 57 T1200 55 L1200 70 Z"/>
        </svg>

        <svg class="trek-footer__rock" viewBox="0 0 20 8" width="20" height="8">
          <path d="M1 8 Q2 2 8 1 Q15 0 19 5 L19 8 Z"/>
        </svg>

        <div class="trek-footer__group" v-html="group"></div>
        <div class="trek-footer__straggler" v-html="straggler"></div>
      </div>

      <div class="trek-footer__links">
        <span>&copy; {{ year }} TMA</span>
        <span class="dot" aria-hidden="true">·</span>
        <button type="button" class="link-button" @click="about">About</button>
        <span class="dot" aria-hidden="true">·</span>
        <a href="mailto:admin@tma.com">Contact</a>
      </div>
    </footer>
  `,
};
