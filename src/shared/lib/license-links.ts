/**
 * Purchase link utilities for the Support Pack.
 *
 * Abstracts the purchase URLs so they can be updated in one place.
 */

/** Gumroad product page (international users) */
const GUMROAD_URL = 'https://papercranedev.gumroad.com/l/better-sidebar-support-pack';

/** 爱发电 product page (China users) */
const AFDIAN_URL = 'https://afdian.com/a/papercranedev';

/**
 * Open the appropriate purchase page based on user locale.
 * Falls back to Gumroad for non-Chinese locales.
 */
export function openPurchasePage(): void {
  const lang = navigator.language || '';
  const isChinese = lang.startsWith('zh');
  const url = isChinese ? AFDIAN_URL : GUMROAD_URL;
  window.open(url, '_blank');
}

/**
 * Get both purchase URLs for display in the UI.
 */
export function getPurchaseLinks() {
  return {
    gumroad: GUMROAD_URL,
    afdian: AFDIAN_URL,
  };
}
