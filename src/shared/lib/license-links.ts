/**
 * Purchase link utilities for Support Pack & Power Pack.
 *
 * Abstracts the purchase URLs so they can be updated in one place.
 */

/** Gumroad — Power Pack (international) */
const GUMROAD_PP_URL = 'https://papercranedev.gumroad.com/l/power-pack';

/** Gumroad — Support Pack (international) */
const GUMROAD_SP_URL = 'https://papercranedev.gumroad.com/l/support-pack';

/** 爱发电 — Support Pack (China) */
const AFDIAN_SP_URL = 'https://afdian.com/item/9f96a3ca5a5e11f1950152540025c377';

/** 爱发电 — Power Pack (China) */
const AFDIAN_PP_URL = 'https://afdian.com/item/cf5531a073b111f18c9c5254001e7c00';

/** Google Form shown when a Power Pack trial ends. */
export const TRIAL_FEEDBACK_FORM_URL = 'https://forms.gle/57E9sA93rfyZG8197';

/**
 * Open the purchase page based on user locale.
 * Chinese locale → 爱发电 (Support Pack), otherwise → Gumroad (Power Pack).
 */
export function openPurchasePage(product: 'power_pack' | 'support_pack' = 'power_pack'): void {
  const url = getDefaultPurchaseUrl(product);
  window.open(url, '_blank');
}

/**
 * Get the default purchase URL based on locale and product.
 */
export function getDefaultPurchaseUrl(product: 'power_pack' | 'support_pack' = 'power_pack'): string {
  const lang = navigator.language || '';
  const isChinese = lang.startsWith('zh');

  if (product === 'power_pack') {
    return isChinese && AFDIAN_PP_URL ? AFDIAN_PP_URL : GUMROAD_PP_URL;
  }
  return isChinese ? AFDIAN_SP_URL : GUMROAD_SP_URL;
}

/**
 * Get all purchase URLs for display in the UI.
 */
export function getPurchaseLinks() {
  return {
    gumroadPp: GUMROAD_PP_URL,
    gumroadSp: GUMROAD_SP_URL,
    afdianSp: AFDIAN_SP_URL,
    afdianPp: AFDIAN_PP_URL,
  };
}
