/**
 * Themed loading animation: a tiny hiker climbs a zig-zag trail to the peak
 * and plants a flag. Usage: <Loader />  or  <Loader label="Fetching treks…" />
 *
 * The hiker follows the trail with CSS Motion Path (offset-path), using the
 * same path data as the dashed trail drawn in the SVG.
 */
export default {
  name: 'Loader',
  props: {
    label: { type: String, default: 'Loading…' },
  },
  template: `
    <div class="trek-loader" role="status">
      <div class="trek-loader__scene" aria-hidden="true">
        <svg viewBox="0 0 120 90" width="120" height="90">
          <path d="M4 86 L46 22 L60 40 L74 14 L116 86 Z" fill="var(--mist)" opacity="0.55"/>
          <path d="M18 86 L62 10 L106 86 Z" fill="var(--moss)"/>
          <path d="M62 10 L52 27 L58 24 L62 30 L67 24 L72 27 Z" fill="var(--cloud)"/>
          <path class="trek-loader__trail" d="M24 84 L52 70 L42 58 L66 44 L56 32 L62 12"
                fill="none" stroke="var(--sand)" stroke-width="1.6" stroke-dasharray="2 3" stroke-linecap="round"/>
          <g class="trek-loader__flag">
            <line x1="62" y1="12" x2="62" y2="1" stroke="var(--forest)" stroke-width="1.4"/>
            <path d="M62 1 L71 4 L62 7 Z" fill="var(--summit)"/>
          </g>
        </svg>
        <span class="trek-loader__hiker">
          <svg viewBox="0 0 10 14" width="10" height="14">
            <circle cx="5" cy="2.2" r="1.8" fill="var(--summit)"/>
            <rect x="1.4" y="4.6" width="2.6" height="4.4" rx="1" fill="var(--clay)"/>
            <line x1="5" y1="4.4" x2="5" y2="9" stroke="var(--forest)" stroke-width="2" stroke-linecap="round"/>
            <line x1="5" y1="9" x2="3.4" y2="13" stroke="var(--forest)" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="5" y1="9" x2="6.8" y2="13" stroke="var(--forest)" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
      </div>
      <p class="trek-loader__label">{{ label }}</p>
    </div>
  `,
};
