<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  SET_TYPES,
  buildQuery,
  fetchCard,
  preloadImage,
} from './composables/useScryfall.js';

// ─── Config (persisted to localStorage) ─────────────────────────────────────

const DEFAULT_CONFIG = {
  interval: 15,
  minYear: 2015,
  excludeUniversesBeyond: true,
  excludeFunny: true,
  setTypes: ['expansion', 'core', 'masters', 'draft_innovation', 'commander'],
  excludedSets: '',
  imageFit: 'contain',
  transitionDuration: 2,
};

/** @returns {object} Merged config */
function loadConfig() {
  try {
    const saved = localStorage.getItem('mtg-screensaver-config');
    return saved
      ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
      : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const config = ref(loadConfig());

watch(
  config,
  (val) => {
    localStorage.setItem('mtg-screensaver-config', JSON.stringify(val));
  },
  { deep: true },
);

// ─── Screensaver state ───────────────────────────────────────────────────────

// Two image slots for A/B crossfade
const slots = ref([
  { card: null, loaded: false },
  { card: null, loaded: false },
]);
const activeSlot = ref(0);
const isPaused = ref(false);
const showConfig = ref(false);
const showHint = ref(false);
const error = ref(null);
const progress = ref(0);

const currentCard = computed(() => slots.value[activeSlot.value].card);
const currentQuery = computed(() => buildQuery(config.value));

// ─── Card loading ────────────────────────────────────────────────────────────

/** @param {number} slotIndex - 0 or 1 */
async function loadCardIntoSlot(slotIndex) {
  try {
    const card = await fetchCard(config.value);
    if (!card.artUrl) throw new Error('No art available for this card');

    // Try mtgpics.com first — higher resolution (~800×583) than Scryfall art_crop (~626×457)
    // Falls back to Scryfall if mtgpics has no art for this card (404, timeout, etc.)
    if (card.mtgpicsUrl) {
      try {
        await preloadImage(card.mtgpicsUrl);
        card.displayUrl = card.mtgpicsUrl;
      } catch {
        await preloadImage(card.artUrl);
        card.displayUrl = card.artUrl;
      }
    } else {
      await preloadImage(card.artUrl);
      card.displayUrl = card.artUrl;
    }

    slots.value[slotIndex].card = card;
    slots.value[slotIndex].loaded = true;
    error.value = null;
  } catch (err) {
    error.value = err.message;
  }
}

// ─── Transitions ─────────────────────────────────────────────────────────────

/** @returns {boolean} True if advance happened, false if next slot not ready */
function advance() {
  const next = activeSlot.value === 0 ? 1 : 0;
  if (!slots.value[next].loaded) return false;

  const old = activeSlot.value;
  activeSlot.value = next;
  slots.value[old].loaded = false;

  // Wait for the CSS fade-out to complete before swapping the image in the
  // inactive slot — otherwise the new image bleeds through during the transition
  const delay = config.value.transitionDuration * 1000;
  setTimeout(() => loadCardIntoSlot(old), delay);

  return true;
}

// ─── Timer ───────────────────────────────────────────────────────────────────

let advanceTimer = null;
let progressTimer = null;
let timerStart = 0;
let timerGen = 0; // generation counter — stale callbacks are ignored

/**
 *
 */
function startTimer() {
  const gen = ++timerGen;
  clearTimeout(advanceTimer);
  clearInterval(progressTimer);
  timerStart = Date.now();
  progress.value = 0;

  const duration = config.value.interval * 1000;

  progressTimer = setInterval(() => {
    if (!isPaused.value && gen === timerGen) {
      progress.value = Math.min(
        100,
        ((Date.now() - timerStart) / duration) * 100,
      );
    }
  }, 100);

  // setTimeout fires once — stale callbacks check generation before running
  advanceTimer = setTimeout(() => {
    if (gen !== timerGen) return;
    if (!isPaused.value) advance();
    startTimer();
  }, duration);
}

/**
 *
 */
function stopTimer() {
  clearTimeout(advanceTimer);
  clearInterval(progressTimer);
  advanceTimer = null;
  progressTimer = null;
}

watch(() => config.value.interval, startTimer);

// ─── Init ────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([loadCardIntoSlot(0), loadCardIntoSlot(1)]);
  startTimer();
});

onUnmounted(() => {
  stopTimer();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mousemove', onMousemove);
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

/** @param {KeyboardEvent} e - Keyboard event */
function onKeydown(e) {
  const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);

  if (e.key === 'Escape') {
    showConfig.value = false;
    return;
  }

  if (inInput || showConfig.value) return;

  switch (e.key) {
    case ' ':
    case 'n':
    case 'N':
      e.preventDefault();
      if (advance()) startTimer();
      break;
    case 'p':
    case 'P':
      isPaused.value = !isPaused.value;
      break;
    case 'c':
    case 'C':
      showConfig.value = !showConfig.value;
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));

// ─── Fullscreen ───────────────────────────────────────────────────────────────

/**
 *
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// ─── Mouse idle ───────────────────────────────────────────────────────────────

let hintTimer = null;

/**
 *
 */
function onMousemove() {
  showHint.value = true;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    showHint.value = false;
  }, 3000);
}

onMounted(() => window.addEventListener('mousemove', onMousemove));

// ─── Config helpers ───────────────────────────────────────────────────────────

/** @param {string} type - Set type value */
function toggleSetType(type) {
  const types = config.value.setTypes;
  config.value.setTypes = types.includes(type)
    ? types.filter((t) => t !== type)
    : [...types, type];
}

/**
 *
 */
function resetConfig() {
  config.value = { ...DEFAULT_CONFIG };
}

/**
 *
 */
async function reloadNow() {
  stopTimer();
  slots.value[0].loaded = false;
  slots.value[1].loaded = false;
  await Promise.all([loadCardIntoSlot(0), loadCardIntoSlot(1)]);
  startTimer();
}
</script>

<template>
  <div class="screensaver">
    <!-- A/B image slots for crossfade -->
    <div
      v-for="(slot, i) in slots"
      :key="i"
      class="slot"
      :style="{ opacity: i === activeSlot && slot.loaded ? 1 : 0 }">
      <!-- Blurred background — fills the screen behind the contained art -->
      <img
        v-if="slot.card && config.imageFit === 'contain'"
        class="slot-bg"
        :src="slot.card.displayUrl"
        aria-hidden="true" />
      <!-- Main art -->
      <img
        v-if="slot.card"
        class="slot-art"
        :src="slot.card.displayUrl"
        :alt="slot.card.name" />
    </div>

    <!-- Vignette for readability of the card info -->
    <div class="vignette"></div>

    <!-- Progress bar at bottom -->
    <div class="progress-bar" :style="{ width: progress + '%' }"></div>

    <!-- Card info overlay (bottom-right) -->
    <Transition name="info">
      <div v-if="currentCard" :key="currentCard.name" class="card-info">
        <div class="card-name">{{ currentCard.name }}</div>
        <div class="card-meta">
          {{ currentCard.setName }} · {{ currentCard.year }}
          <span class="set-code"
            >{{ currentCard.setCode }} #{{ currentCard.collectorNumber }}</span
          >
        </div>
        <div class="card-type">{{ currentCard.typeLine }}</div>
        <div class="card-artist">Art by {{ currentCard.artist }}</div>
        <a
          :href="currentCard.scryfallUri"
          class="scryfall-link"
          target="_blank"
          @click.stop>
          Scryfall ↗
        </a>
      </div>
    </Transition>

    <!-- Paused badge -->
    <Transition name="fade">
      <div v-if="isPaused" class="status-badge">⏸ PAUSED</div>
    </Transition>

    <!-- Error badge -->
    <Transition name="fade">
      <div v-if="error && !isPaused" class="error-badge" :title="error">
        ⚠ {{ error }}
      </div>
    </Transition>

    <!-- Keyboard shortcuts hint (shows on mouse move) -->
    <Transition name="fade">
      <div v-if="showHint && !showConfig" class="hint">
        <span>Space/N · next</span>
        <span>P · pause</span>
        <span>C · config</span>
        <span>F · fullscreen</span>
      </div>
    </Transition>

    <!-- Config panel -->
    <Transition name="config">
      <div
        v-if="showConfig"
        class="config-overlay"
        @click.self="showConfig = false">
        <div class="config-panel">
          <div class="config-header">
            <h2>Screensaver Config</h2>
            <button class="close-btn" @click="showConfig = false">✕</button>
          </div>

          <div class="config-body">
            <!-- Display -->
            <section class="config-section">
              <h3>Display</h3>

              <label class="row">
                <span>Interval</span>
                <div class="slider-group">
                  <input
                    v-model.number="config.interval"
                    type="range"
                    min="5"
                    max="120"
                    step="5" />
                  <span class="val">{{ config.interval }}s</span>
                </div>
              </label>

              <label class="row">
                <span>Transition</span>
                <div class="slider-group">
                  <input
                    v-model.number="config.transitionDuration"
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5" />
                  <span class="val">{{ config.transitionDuration }}s</span>
                </div>
              </label>

              <label class="row">
                <span>Image fit</span>
                <select v-model="config.imageFit">
                  <option value="contain">Contain + fond flouté</option>
                  <option value="cover">Cover (plein écran, recadré)</option>
                </select>
              </label>
            </section>

            <!-- Filters -->
            <section class="config-section">
              <h3>Filters</h3>

              <label class="row">
                <span>Min release year</span>
                <div class="slider-group">
                  <input
                    v-model.number="config.minYear"
                    type="range"
                    min="1993"
                    max="2026"
                    step="1" />
                  <span class="val">{{ config.minYear }}</span>
                </div>
              </label>

              <label class="row toggle">
                <span>
                  Exclude Universes Beyond
                  <small>Marvel, TMNT, Doctor Who, Warhammer…</small>
                </span>
                <input
                  v-model="config.excludeUniversesBeyond"
                  type="checkbox" />
              </label>

              <label class="row toggle">
                <span>
                  Exclude Un-sets
                  <small>Parody/joke sets</small>
                </span>
                <input v-model="config.excludeFunny" type="checkbox" />
              </label>

              <div class="row col">
                <span>Set types</span>
                <div class="chips">
                  <label
                    v-for="type in SET_TYPES"
                    :key="type.value"
                    class="chip"
                    :class="{ active: config.setTypes.includes(type.value) }">
                    <input
                      type="checkbox"
                      :checked="config.setTypes.includes(type.value)"
                      @change="toggleSetType(type.value)" />
                    {{ type.label }}
                  </label>
                </div>
              </div>

              <label class="row col">
                <span>
                  Excluded sets
                  <small>Comma-separated set codes (e.g. sld, eld, mkm)</small>
                </span>
                <input
                  v-model="config.excludedSets"
                  type="text"
                  class="text-input"
                  placeholder="e.g. sld, eld" />
              </label>
            </section>

            <!-- Debug -->
            <section class="config-section">
              <h3>Debug</h3>

              <div class="row col">
                <span>Scryfall query</span>
                <code class="query">{{ currentQuery }}</code>
              </div>

              <div v-if="currentCard" class="row col">
                <span>Current card</span>
                <pre class="card-json">{{
                  JSON.stringify(currentCard, null, 2)
                }}</pre>
              </div>
            </section>
          </div>

          <div class="config-footer">
            <button class="btn" @click="resetConfig">Reset defaults</button>
            <button class="btn" @click="reloadNow">Reload now</button>
            <button class="btn btn-primary" @click="showConfig = false">
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ─── Root ──────────────────────────────────────────────────────────────────── */

.screensaver {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
}

/* ─── Image slots ───────────────────────────────────────────────────────────── */

.slot {
  position: absolute;
  inset: 0;
  transition: opacity v-bind('config.transitionDuration + "s"') ease-in-out;
}

/* Blurred background — slightly oversized to hide blur edge artifacts */
.slot-bg {
  position: absolute;
  inset: -4%;
  width: 108%;
  height: 108%;
  object-fit: cover;
  object-position: center;
  filter: blur(28px) brightness(0.35) saturate(1.3);
  display: block;
}

/* Main art, shown at its correct ratio with no cropping */
.slot-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: v-bind('config.imageFit');
  object-position: center;
  display: block;
}

/* ─── Vignette ──────────────────────────────────────────────────────────────── */

.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse at center,
      transparent 50%,
      rgba(0, 0, 0, 0.35) 100%
    ),
    linear-gradient(to right, transparent 55%, rgba(0, 0, 0, 0.65) 100%),
    linear-gradient(to top, rgba(0, 0, 0, 0.25) 0%, transparent 25%);
  z-index: 5;
}

/* ─── Progress bar ──────────────────────────────────────────────────────────── */

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.35);
  transition: width 0.1s linear;
  z-index: 10;
}

/* ─── Card info ─────────────────────────────────────────────────────────────── */

.card-info {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  text-align: right;
  z-index: 20;
  max-width: 400px;
}

.card-name {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1.65rem;
  font-weight: bold;
  color: #fff;
  text-shadow:
    0 2px 12px rgba(0, 0, 0, 0.9),
    0 0 40px rgba(0, 0, 0, 0.6);
  line-height: 1.2;
  margin-bottom: 0.35rem;
}

.card-meta {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  margin-bottom: 0.15rem;
}

.set-code {
  color: rgba(255, 255, 255, 0.45);
  margin-left: 0.4rem;
  font-size: 0.72rem;
}

.card-type {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
  font-style: italic;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  margin-bottom: 0.15rem;
}

.card-artist {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  margin-bottom: 0.4rem;
}

.scryfall-link {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  text-decoration: none;
  transition: color 0.2s;
}

.scryfall-link:hover {
  color: rgba(255, 255, 255, 0.75);
}

/* ─── Status / error badges ─────────────────────────────────────────────────── */

.status-badge,
.error-badge {
  position: absolute;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.45rem 1.2rem;
  border-radius: 2rem;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  z-index: 30;
  white-space: nowrap;
}

.status-badge {
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);
}

.error-badge {
  background: rgba(180, 40, 40, 0.85);
  color: #fff;
  max-width: 80%;
  text-align: center;
  white-space: normal;
}

/* ─── Hint ──────────────────────────────────────────────────────────────────── */

.hint {
  position: absolute;
  bottom: 1rem;
  left: 1.5rem;
  display: flex;
  gap: 1.25rem;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
  z-index: 20;
  letter-spacing: 0.03em;
}

/* ─── Transitions ───────────────────────────────────────────────────────────── */

.info-enter-active {
  transition: opacity 1.2s ease 0.3s;
}
.info-leave-active {
  transition: opacity 0.6s ease;
}
.info-enter-from,
.info-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.config-enter-active,
.config-leave-active {
  transition: opacity 0.25s ease;
}
.config-enter-from,
.config-leave-to {
  opacity: 0;
}

/* ─── Config overlay ────────────────────────────────────────────────────────── */

.config-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.config-panel {
  background: #181818;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  width: min(660px, 95vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  color: #ddd;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7);
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.config-header h2 {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  transition: color 0.15s;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.config-body {
  overflow-y: auto;
  flex: 1;
}

.config-section {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.config-section:last-child {
  border-bottom: none;
}

.config-section h3 {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 0.85rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.7rem;
  font-size: 0.85rem;
  color: #bbb;
}

.row:last-child {
  margin-bottom: 0;
}

.row.col {
  flex-direction: column;
  align-items: flex-start;
}

.row.toggle {
  cursor: pointer;
}

.row small {
  display: block;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 0.1rem;
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.slider-group input[type='range'] {
  width: 150px;
  accent-color: #8b6cf7;
}

.val {
  min-width: 2.8rem;
  text-align: right;
  font-size: 0.8rem;
  color: #999;
  font-variant-numeric: tabular-nums;
}

select {
  background: #252525;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ddd;
  padding: 0.3rem 0.55rem;
  border-radius: 5px;
  font-size: 0.82rem;
  cursor: pointer;
}

select:focus {
  outline: none;
  border-color: #8b6cf7;
}

input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: #8b6cf7;
  cursor: pointer;
  flex-shrink: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.45rem;
}

.chip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  background: #252525;
  padding: 0.28rem 0.65rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition:
    background 0.15s,
    border-color 0.15s;
  color: #999;
}

.chip.active {
  background: rgba(139, 108, 247, 0.15);
  border-color: rgba(139, 108, 247, 0.4);
  color: #c5b8fc;
}

.chip:hover {
  background: #2e2e2e;
}
.chip.active:hover {
  background: rgba(139, 108, 247, 0.22);
}

.chip input {
  display: none;
}

.text-input {
  width: 100%;
  background: #252525;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ddd;
  padding: 0.4rem 0.65rem;
  border-radius: 5px;
  font-size: 0.82rem;
  margin-top: 0.4rem;
}

.text-input:focus {
  outline: none;
  border-color: #8b6cf7;
}

.query {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 0.76rem;
  background: #0f0f0f;
  padding: 0.7rem 0.85rem;
  border-radius: 5px;
  color: #7db87d;
  word-break: break-all;
  width: 100%;
  margin-top: 0.45rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: block;
}

.card-json {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 0.7rem;
  background: #0f0f0f;
  padding: 0.7rem 0.85rem;
  border-radius: 5px;
  color: #777;
  overflow: auto;
  max-height: 180px;
  width: 100%;
  margin-top: 0.45rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.config-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.btn {
  padding: 0.45rem 1.1rem;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #252525;
  color: #ccc;
  transition: background 0.15s;
}

.btn:hover {
  background: #303030;
}

.btn-primary {
  background: #8b6cf7;
  border-color: #8b6cf7;
  color: #fff;
}

.btn-primary:hover {
  background: #7a5de6;
}
</style>
