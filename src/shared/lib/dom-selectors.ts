/**
 * Centralized DOM selectors and click helpers for interacting with
 * native UI elements on each platform.
 *
 * Using structural selectors (tag names, classes, DOM position) instead of
 * aria-label strings, because aria-labels are localized per browser language
 * and break for non-English users.
 */

// ─── Gemini Selectors ────────────────────────────────────────────────────────

export const GEMINI_SELECTORS = {
  /** Close sidebar button (desktop) */
  closeSidebar: '.sidenav-with-history-container .close-sidenav-button',
  /** Open sidebar button (desktop) — the sparkle/hamburger button */
  openSidebar: 'side-nav-sparkle-button .side-nav-sparkle-button',
  /** Mobile sidebar toggle (hamburger menu) */
  mobileMenu: 'side-nav-menu-button gem-icon-button button',
  /** Signed-in user's avatar image in the sidenav footer */
  accountAvatar: 'sidenav-mavatar-footer .mavatar-container img',
  /** Avatar link wrapping that image — opens the Google account menu */
  accountMenu: ['sidenav-mavatar-footer .mavatar-footer-row a'],
  /**
   * Sign-in control, shown instead of the avatar when nobody is signed in.
   * Gemini renders a different element per footer state — icon-only while the
   * native sidenav is collapsed, labelled while it is expanded — and only one
   * of them is in the DOM at a time.
   */
  accountSignIn: [
    'sidenav-mavatar-footer gem-icon-button button',
    'sidenav-mavatar-footer .mavatar-footer-row gem-button button',
  ],
  /** Container holding the native "temporary chat" toggle */
  tempChatButton: 'div[data-test-id="temp-chat-button-container"] button',
  /**
   * Two signals for the same state, because neither covers the whole session.
   *
   * `temp-chat-on` marks the toggle while the chat is still empty, but Gemini
   * drops the class as soon as the first message is sent — which is *before* the
   * StreamGenerate response we need to classify arrives. Checking only that class
   * would therefore report false at the one moment it matters.
   *
   * `.temporary-chat-header` is the banner Gemini renders for the duration of an
   * active temporary conversation, so it covers every turn from the first onward.
   */
  temporaryChatState: [
    '.temporary-chat-header',
    'div[data-test-id="temp-chat-button-container"] button.temp-chat-on',
  ],
} as const;

// ─── AI Studio Selectors ─────────────────────────────────────────────────────

export const AISTUDIO_SELECTORS = {
  /** Sidebar toggle button in top toolbar */
  toggleSidebar: 'ms-playground-toolbar .toolbar-left button',
  /**
   * Collapse button in the redesigned navbar's own header.
   *
   * The redesign moved AI Studio's collapse control out of the top toolbar and
   * into the navbar itself, which is exactly the part we hide — so the sidebar
   * has to grow its own button and forward the click here.
   *
   * This is the *collapse* direction only. Once collapsed the navbar is out of
   * the layout entirely, this button with it, and `toggleSidebar` above is what
   * brings it back.
   */
  collapseNavbar: 'ms-navbar-v2 .navbar-header > button',
  /**
   * The navbar, either generation, and the inner element that carries the
   * `collapsed` class.
   *
   * AI Studio marks the state on the navbar's first child rather than on the
   * navbar itself; `Layout.tsx` watches the same element to keep our wrapper's
   * width in step with it.
   */
  navbar: 'ms-navbar, ms-navbar-v2',
  /** Close run-settings panel (last button inside the right section, only when panel is open) */
  closeRunSettings: 'ms-right-side-panel ms-run-settings .right>button:last-child',
  /** Toggle run-settings panel button in toolbar */
  toggleRunSettings: 'ms-playground-toolbar .runsettings-toggle-button',
  /** Signed-in user's avatar image in the navbar's account switcher */
  accountAvatar: 'ms-account-switcher connect-avatar img',
  /**
   * Account switcher button — opens the Google account menu. AI Studio requires
   * a signed-in user, so there is no sign-out state to handle here.
   */
  accountMenu: [
    '.account-switcher-container button.account-switcher-button',
    'ms-account-switcher button.account-switcher-button',
  ],
  /**
   * The account menu itself, once open. It lives in the CDK overlay layer at the
   * end of `<body>`, not next to its trigger, and positions itself with offsets
   * measured against the native navbar — so it needs nudging back on screen when
   * opened from our narrower icon rail.
   */
  accountPanel: ['.cdk-overlay-container .ms-account-switcher-panel'],
} as const;

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * First element matching any of `selectors`, tried in the order given.
 *
 * Selector order matters, which is why this is not a single comma-separated
 * query: `querySelector` resolves those in *document* order, so the most
 * specific candidate does not necessarily win.
 */
export function queryFirst(
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

// ─── Click Helpers ───────────────────────────────────────────────────────────

/**
 * Try to click the first element matching the selector.
 * Returns true if an element was found and clicked.
 */
function clickFirst(selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (el) {
    el.click();
    return true;
  }
  return false;
}

/**
 * Toggle the Gemini native sidebar.
 * Tries close → open → mobile menu in order.
 */
export function toggleGeminiSidebar(): boolean {
  if (clickFirst(GEMINI_SELECTORS.closeSidebar)) return true;
  if (clickFirst(GEMINI_SELECTORS.openSidebar)) return true;
  if (clickFirst(GEMINI_SELECTORS.mobileMenu)) return true;
  console.warn('Better Sidebar: Gemini sidebar toggle button not found');
  return false;
}

/**
 * Whether Gemini is currently in a temporary chat.
 *
 * Read from the DOM rather than from our own state because the user can toggle
 * temporary chat from Gemini's native UI, which we never hear about. Called from
 * the main-world interceptor at response time, so it has to stay synchronous.
 */
export function isGeminiTemporaryChat(): boolean {
  return queryFirst(GEMINI_SELECTORS.temporaryChatState) !== null;
}

/**
 * Whether the AI Studio navbar is currently collapsed.
 *
 * Read from the DOM, not from our own state: the user can collapse from the
 * native toolbar too, and there is no event to hear about it.
 */
export function isAIStudioNavbarCollapsed(): boolean {
  const navbar = document.querySelector(AISTUDIO_SELECTORS.navbar);
  return navbar?.firstElementChild?.classList.contains('collapsed') ?? false;
}

/**
 * Collapse the AI Studio navbar via its own header button.
 *
 * Works on a `display: none` navbar because synthetic `click()` skips hit
 * testing — nothing here is positioned, so the button needs no geometry.
 */
export function collapseAIStudioNavbar(): boolean {
  return clickFirst(AISTUDIO_SELECTORS.collapseNavbar);
}

/**
 * Toggle the AI Studio native sidebar.
 *
 * The two directions live in two different places now, which is why this reads
 * the state first instead of clicking one button twice. The redesign moved
 * collapsing into the navbar's own header, and once collapsed the navbar — that
 * button included — is gone from the layout, so expanding is only reachable from
 * the top toolbar.
 *
 * Ordering matters, not just correctness: `toolbar-left`'s first button is
 * whatever AI Studio puts there, and while the navbar is expanded that is no
 * longer the sidebar toggle. Checking the collapsed state keeps us from clicking
 * some unrelated control. The toolbar is still the fallback when the header
 * button cannot be found, which is how the legacy `ms-navbar` gets toggled.
 */
export function toggleAIStudioSidebar(): boolean {
  if (!document.querySelector(AISTUDIO_SELECTORS.navbar)) return false;

  if (!isAIStudioNavbarCollapsed() && collapseAIStudioNavbar()) return true;
  return clickFirst(AISTUDIO_SELECTORS.toggleSidebar);
}

/**
 * Close the AI Studio run-settings panel if visible.
 * Only matches when ms-right-side-panel is present in DOM (panel is open).
 */
export function closeAIStudioRunSettings(): boolean {
  return clickFirst(AISTUDIO_SELECTORS.closeRunSettings);
}
