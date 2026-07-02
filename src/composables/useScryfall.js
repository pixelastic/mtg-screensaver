/**
 * Available set types for filtering, shown in the config panel
 */
export const SET_TYPES = [
  { value: 'expansion', label: 'Expansions' },
  { value: 'core', label: 'Core Sets' },
  { value: 'masters', label: 'Masters' },
  { value: 'draft_innovation', label: 'Draft Innovation (MH, etc.)' },
  { value: 'commander', label: 'Commander' },
  { value: 'planechase', label: 'Planechase' },
  { value: 'archenemy', label: 'Archenemy' },
];

/**
 * Build a Scryfall search query string from config options
 * @param {object} config - Screensaver config options
 * @returns {string} Scryfall query string
 */
export function buildQuery(config) {
  const parts = ['game:paper'];

  if (config.excludeUniversesBeyond) parts.push('-is:universesbeyond');
  if (config.excludeFunny) parts.push('-set_type:funny');

  parts.push(`year>=${config.minYear}`);

  if (config.setTypes && config.setTypes.length > 0) {
    const joined = config.setTypes.map((t) => `set_type:${t}`).join(' OR ');
    parts.push(`(${joined})`);
  }

  const excluded = config.excludedSets
    ? config.excludedSets
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  for (const code of excluded) {
    parts.push(`-set:${code}`);
  }

  return parts.join(' ');
}

/**
 * Extract image URLs from a card, handling double-faced cards
 * @param {object} card - Raw Scryfall card object
 * @returns {{ artUrl: string|null }} Art crop URL
 */
function getImageUrls(card) {
  const uris = card.image_uris || card.card_faces?.[0]?.image_uris || {};
  return { artUrl: uris.art_crop || uris.large || null };
}

/**
 * Build a mtgpics.com art URL — higher resolution than Scryfall art_crop (~800×583)
 * Returns null if the collector number has no numeric part
 * @param {string} setCode - lowercase set code (e.g. "znr")
 * @param {string} collectorNumber - Scryfall collector_number (e.g. "312", "312a")
 * @returns {string|null} Full mtgpics art URL
 */
function getMtgpicsUrl(setCode, collectorNumber) {
  const num = collectorNumber.replace(/\D/g, '');
  if (!num) return null;
  const padded = num.padStart(3, '0');
  return `https://www.mtgpics.com/pics/art/${setCode}/${padded}.jpg`;
}

/**
 * Fetch a random MTG card from Scryfall matching the given config filters
 * @param {object} config - Screensaver config options
 * @returns {Promise<object>} Normalized card data
 */
export async function fetchCard(config) {
  const query = buildQuery(config);
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'mtg-screensaver/1.0' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.details || `Scryfall error ${response.status}`);
  }

  const card = await response.json();
  const { artUrl } = getImageUrls(card);
  const mtgpicsUrl = getMtgpicsUrl(card.set, card.collector_number);

  return {
    name: card.name,
    setName: card.set_name,
    setCode: card.set.toUpperCase(),
    collectorNumber: card.collector_number,
    year: card.released_at?.slice(0, 4) || '?',
    artist: card.artist || 'Unknown',
    typeLine: card.type_line || '',
    rarity: card.rarity || '',
    artUrl,
    mtgpicsUrl,
    scryfallUri: card.scryfall_uri,
    // displayUrl is set by loadCardIntoSlot after resolving the best available image
    displayUrl: null,
  };
}

/**
 * Try to preload an image within a given timeout.
 * Resolves with the src on success, rejects on error or timeout.
 * @param {string} src - Image URL to preload
 * @param {number} timeout - ms
 * @returns {Promise<string>} Resolves with src on success
 */
export function preloadImage(src, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Timeout loading: ${src}`));
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(src);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to load: ${src}`));
    };
    img.src = src;
  });
}
