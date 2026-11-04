/**
 * Trek picture: trek.image_url when set, otherwise a generated mountain
 * scene in theme colours. The trek id seeds a tiny random generator, so each
 * trek always gets the same - but a different - illustration.
 */
const SKIES = [
  ['#a0c3be', '#e7e9db'], ['#4ca0b4', '#cfe3e2'], ['#cecbb4', '#f3efe0'], ['#8fb8c7', '#e7e9db'],
];
const RIDGES = [
  ['#a0c3be', '#4b5e54', '#26372e'], ['#cecbb4', '#9a7461', '#26372e'],
  ['#8fb0a6', '#4b5e54', '#1b2821'], ['#b9c9b0', '#6d7f62', '#26372e'],
];

function seeded(seed) {
  // mulberry32: deterministic pseudo-random numbers in [0, 1)
  let t = seed * 2654435761;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(rand, baseY, height, peaks) {
  const points = [[0, 240], [0, baseY]];
  const step = 400 / peaks;
  for (let i = 0; i < peaks; i++) {
    const x = i * step + step / 2 + (rand() - 0.5) * step * 0.5;
    points.push([x, baseY - height * (0.55 + rand() * 0.45)]);
    points.push([(i + 1) * step, baseY - height * rand() * 0.35]);
  }
  points.push([400, 240]);
  return points;
}

export default {
  name: 'TrekImage',
  props: { trek: { type: Object, required: true } },
  data: () => ({ failed: false }),
  computed: {
    art() {
      const rand = seeded(this.trek.id || 1);
      const sky = SKIES[(this.trek.id || 0) % SKIES.length];
      const colours = RIDGES[Math.floor(rand() * RIDGES.length)];
      const back = ridge(rand, 170, 120, 3 + Math.floor(rand() * 2));
      // snow caps: small triangles at the tallest back peaks
      const caps = back.slice(2, -1).filter((p, i) => i % 2 === 0 && p[1] < 105)
        .map(([x, y]) => `${x},${y} ${x - 14},${y + 20} ${x + 14},${y + 20}`);
      return {
        id: `sky-${this.trek.id}`,
        sky,
        // y 72-88 keeps the sun inside the frame even when a wide banner crops the top
        sun: { x: 60 + rand() * 280, y: 72 + rand() * 16, r: 12 + rand() * 6 },
        layers: [
          { fill: colours[0], points: back.map((p) => p.join(',')).join(' ') },
          { fill: colours[1], points: ridge(rand, 200, 80, 4 + Math.floor(rand() * 2)).map((p) => p.join(',')).join(' ') },
          { fill: colours[2], points: ridge(rand, 230, 45, 6).map((p) => p.join(',')).join(' ') },
        ],
        caps,
      };
    },
  },
  template: `
    <img v-if="trek.image_url && !failed" class="trek-image" :src="trek.image_url" :alt="trek.name" @error="failed = true">
    <svg v-else class="trek-image" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" :aria-label="trek.name">
      <defs>
        <linearGradient :id="art.id" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="art.sky[0]" />
          <stop offset="1" :stop-color="art.sky[1]" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" :fill="'url(#' + art.id + ')'" />
      <circle :cx="art.sun.x" :cy="art.sun.y" :r="art.sun.r" fill="#f28c28" opacity="0.85" />
      <polygon :points="art.layers[0].points" :fill="art.layers[0].fill" />
      <polygon v-for="(c, i) in art.caps" :key="i" :points="c" fill="#ffffff" opacity="0.9" />
      <polygon :points="art.layers[1].points" :fill="art.layers[1].fill" />
      <polygon :points="art.layers[2].points" :fill="art.layers[2].fill" />
    </svg>
  `,
};
