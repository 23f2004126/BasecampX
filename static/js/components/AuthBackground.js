/**
 * Full-screen animated background for the login and register pages.
 *
 * mode="video" (Login): plays login-bg.mp4 once. When it ends (or is skipped,
 *   or autoplay is blocked) we show the poster image - the video's exact last
 *   frame - so the switch is invisible, run a slow 1.05 -> 1.0 "settle" zoom,
 *   fade in a vignette for readability, and emit "done".
 * mode="still" (Register): poster image with the same effects; "done" at once.
 *
 * Layers (back to front):
 *   parallax wrapper -> settle wrapper -> video + poster -> soften/grain overlay
 *   vignette, drifting clouds, skip button
 */
import { canHover, prefersReducedMotion } from '../utils/motion.js';

const VIDEO_SRC = '/static/media/login-bg.mp4';
const POSTER_SRC = '/static/img/login-bg-end.jpg';
const START_TIMEOUT_MS = 3000; // if the video hasn't started by then, show the still

export default {
  name: 'AuthBackground',
  props: {
    mode: { type: String, default: 'video', validator: (v) => ['video', 'still'].includes(v) },
  },
  emits: ['done'],
  data() {
    return {
      playing: this.mode === 'video',
      finished: false, // true once we're on the last frame
      videoSrc: VIDEO_SRC,
      posterSrc: POSTER_SRC,
    };
  },
  mounted() {
    if (this.mode === 'still' || prefersReducedMotion()) {
      this.finish();
    } else {
      this.startVideo();
    }
    if (canHover() && !prefersReducedMotion()) this.startParallax();
  },
  beforeUnmount() {
    clearTimeout(this.startTimer);
    cancelAnimationFrame(this.parallaxFrame);
    window.removeEventListener('mousemove', this.onMouseMove);
  },
  methods: {
    startVideo() {
      const video = this.$refs.video;
      video.muted = true; // must be set as a property for autoplay to be allowed
      // Safety net: slow network or a stalled video should never trap the user.
      this.startTimer = setTimeout(() => {
        if (video.paused || video.currentTime === 0) this.finish();
      }, START_TIMEOUT_MS);

      const attempt = video.play();
      if (attempt && attempt.catch) {
        // Autoplay blocked (e.g. iOS Low Power Mode): skip straight to the still.
        attempt.catch(() => this.finish());
      }
    },

    /** Called on: video ended, Skip clicked, autoplay blocked, error, still mode. */
    finish() {
      if (this.finished) return;
      clearTimeout(this.startTimer);
      const video = this.$refs.video;
      if (video) video.pause();
      this.playing = false;
      this.finished = true;
      this.$emit('done');
    },

    // ---- Mouse parallax: background drifts slightly opposite to the cursor ----
    startParallax() {
      this.target = { x: 0, y: 0 };
      this.current = { x: 0, y: 0 };
      this.onMouseMove = (e) => {
        // -1 .. 1 from the centre of the screen
        this.target.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.target.y = (e.clientY / window.innerHeight) * 2 - 1;
        if (!this.parallaxFrame) this.parallaxFrame = requestAnimationFrame(this.parallaxStep);
      };
      window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    },
    parallaxStep() {
      // Ease 6% of the way towards the target every frame -> smooth, lagging motion
      const c = this.current;
      c.x += (this.target.x - c.x) * 0.06;
      c.y += (this.target.y - c.y) * 0.06;
      this.$el.style.setProperty('--px', c.x.toFixed(4));
      this.$el.style.setProperty('--py', c.y.toFixed(4));
      const settled = Math.abs(this.target.x - c.x) < 0.001 && Math.abs(this.target.y - c.y) < 0.001;
      this.parallaxFrame = settled ? null : requestAnimationFrame(this.parallaxStep);
    },
  },
  template: `
    <div class="auth-bg" :class="{ 'is-finished': finished }">
      <div class="auth-bg__parallax">
        <div class="auth-bg__settle">
          <video
            v-if="mode === 'video'"
            ref="video"
            class="auth-bg__media"
            :src="videoSrc"
            :poster="posterSrc"
            autoplay
            muted
            playsinline
            preload="auto"
            disablepictureinpicture
            aria-hidden="true"
            tabindex="-1"
            @ended="finish"
            @error="finish"
          ></video>
          <!-- The exact last frame; shown once the video is over -->
          <img class="auth-bg__media auth-bg__poster" :src="posterSrc" alt="" aria-hidden="true">
        </div>
        <div class="auth-bg__soften" aria-hidden="true"></div>
      </div>

      <div class="auth-bg__vignette" aria-hidden="true"></div>

      <div class="auth-bg__clouds" aria-hidden="true">
        <span class="cloud cloud--1"></span>
        <span class="cloud cloud--2"></span>
        <span class="cloud cloud--3"></span>
        <span class="cloud cloud--4"></span>
      </div>

      <button
        v-if="playing"
        type="button"
        class="auth-bg__skip"
        @click="finish"
      >
        Skip intro <i class="bi bi-skip-forward-fill" aria-hidden="true"></i>
      </button>
    </div>
  `,
};
