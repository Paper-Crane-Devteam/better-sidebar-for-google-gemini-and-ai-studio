/**
 * Purchase link utilities for the Support Pack.
 *
 * Abstracts the purchase URLs so they can be updated in one place.
 */

/** Gumroad product page (international) */
const GUMROAD_URL = 'https://papercranedev.gumroad.com/l/support-pack';

/** 爱发电 product page (China) */
const AFDIAN_URL = 'https://afdian.com/item/9f96a3ca5a5e11f1950152540025c377';

/**
 * Open the purchase page based on user locale.
 * Chinese locale → 爱发电, otherwise → Gumroad.
 */
export function openPurchasePage(): void {
  const url = getDefaultPurchaseUrl();
  window.open(url, '_blank');
}

/**
 * Get the default purchase URL based on locale.
 */
export function getDefaultPurchaseUrl(): string {
  const lang = navigator.language || '';
  const isChinese = lang.startsWith('zh');
  return isChinese ? AFDIAN_URL : GUMROAD_URL;
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
