/**
 * Natural pixel dimensions of the quantity photographs.
 *
 * The tiles were cropped at 1:1 from the source images and never rescaled, so
 * their sizes carry the actual proportions: the 400g pile really is that much
 * bigger than the 50g one. Displaying them at a uniform size would throw that
 * away and defeat the point of having photographs at all.
 *
 * Read once from img/sizes.json rather than duplicated here, so regenerating
 * the tiles cannot leave the layout describing sizes that no longer exist.
 */

let sizes = null;

/** Loads the manifest. Call once at startup, before any form renders. */
export async function loadImageSizes() {
  if (sizes) return sizes;

  try {
    const response = await fetch('img/sizes.json', { cache: 'no-cache' });
    sizes = await response.json();
  } catch (err) {
    // Not fatal: the picker falls back to equal-sized buttons, which is worse
    // for calibration but still perfectly usable.
    console.warn('Could not load img/sizes.json; quantity images will not be scaled.', err);
    sizes = {};
  }

  return sizes;
}

/** `{w, h}` for a key like 'food-400', or null when unknown. */
export function getImageSize(key) {
  return (sizes && sizes[key]) || null;
}

/**
 * The width of one tile as a fraction of the largest in its set, so the buttons
 * can be laid out with honest relative sizes.
 */
export function relativeWidth(prefix, amount, amounts) {
  const own = getImageSize(prefix + '-' + amount);
  if (!own) return 1;

  const widest = amounts.reduce(function (max, candidate) {
    const size = getImageSize(prefix + '-' + candidate);
    return size && size.w > max ? size.w : max;
  }, 0);

  return widest > 0 ? own.w / widest : 1;
}
