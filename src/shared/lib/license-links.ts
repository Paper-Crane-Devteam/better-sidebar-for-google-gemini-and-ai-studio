/**
 * Purchase link utilities for the Support Pack.
 *
 * Abstracts the purchase URLs so they can be updated in one place.
 */

/** Gumroad product page */
const GUMROAD_URL = 'https://papercranedev.gumroad.com/l/support-pack';

/**
 * Open the Gumroad purchase page.
 */
export function openPurchasePage(): void {
  window.open(GUMROAD_URL, '_blank');
}

/**
 * Get the purchase URL for display in the UI.
 */
export function getPurchaseLinks() {
  return {
    gumroad: GUMROAD_URL,
  };
}
