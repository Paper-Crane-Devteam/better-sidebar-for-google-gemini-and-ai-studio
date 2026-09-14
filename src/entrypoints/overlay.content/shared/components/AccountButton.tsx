/**
 * Sidebar stand-in for the platform's own account avatar.
 *
 * The enhanced sidebar hides the native navigation, and the account chip goes
 * with it — which on Gemini and AI Studio also takes away the only way to reach
 * the Google account menu, switch profiles, or sign in. This button mirrors that
 * chip: it shows the same avatar image, read straight off the hidden native
 * `<img>`, and delegates the click to the native control so the real Google menu
 * opens rather than a re-implementation of it.
 *
 * Delegation goes through `clickHiddenNativeElement`, which lends the native
 * control this button's on-screen rect for as long as the menu stays open.
 * Without that the menu would be anchored to an element parked at -9999px. See
 * `native-anchor-click.ts`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CircleUserRound } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import {
  AISTUDIO_SELECTORS,
  GEMINI_SELECTORS,
  queryFirst,
} from '@/shared/lib/dom-selectors';
import { clickHiddenNativeElement } from '@/shared/lib/native-anchor-click';

export interface AccountButtonConfig {
  /** Selector for the native `<img>` holding the signed-in user's avatar. */
  avatarSelector: string;
  /** Candidates for the control that opens the account menu, most specific first. */
  menuSelectors: readonly string[];
  /**
   * Candidates for the native sign-in control. Omitted on platforms that cannot
   * be used while signed out, which have no sign-in state to render.
   */
  signInSelectors?: readonly string[];
  /**
   * Candidates for the popup the click opens. Lets the click helper hold the
   * borrowed anchor geometry for as long as the popup is open, and keep the
   * popup inside the viewport. See `native-anchor-click.ts`.
   */
  popupSelectors?: readonly string[];
  /** Signed-in account name or email, used as the tooltip when available. */
  readAccountName?: () => string | null;
}

export const GEMINI_ACCOUNT: AccountButtonConfig = {
  avatarSelector: GEMINI_SELECTORS.accountAvatar,
  menuSelectors: GEMINI_SELECTORS.accountMenu,
  signInSelectors: GEMINI_SELECTORS.accountSignIn,
  // Gemini publishes the signed-in account in a meta tag, which survives the
  // sidenav being hidden and needs no DOM digging.
  readAccountName: () =>
    document
      .querySelector('meta[name="og-profile-acct"]')
      ?.getAttribute('content')
      ?.trim() || null,
};

export const AISTUDIO_ACCOUNT: AccountButtonConfig = {
  avatarSelector: AISTUDIO_SELECTORS.accountAvatar,
  menuSelectors: AISTUDIO_SELECTORS.accountMenu,
  popupSelectors: AISTUDIO_SELECTORS.accountPanel,
  readAccountName: () =>
    document
      .querySelector('.account-switcher-container .account-switcher-text')
      ?.textContent?.trim() || null,
};

/**
 * How often the native footer is re-read.
 *
 * Polling rather than observing: the footer sits outside our tree, is re-created
 * by the host framework on navigation, and the only alternative that would catch
 * every case is an attribute observer over the whole body — far more expensive,
 * on both platforms, than two `querySelector` calls a second.
 */
const POLL_MS = 1000;

/** What the native footer currently offers. */
type AccountState = 'signedIn' | 'signedOut' | 'unavailable';

interface NativeAccount {
  state: AccountState;
  avatarUrl: string | null;
  name: string | null;
}

function readNativeAccount(config: AccountButtonConfig): NativeAccount {
  const img = document.querySelector(
    config.avatarSelector,
  ) as HTMLImageElement | null;

  // Which control exists decides the state, not whether the image has loaded:
  // the avatar arrives over the network a beat after the chip renders, and
  // keying off the image would flash a sign-in button at a signed-in user.
  let state: AccountState = 'unavailable';
  if (queryFirst(config.menuSelectors)) state = 'signedIn';
  else if (config.signInSelectors && queryFirst(config.signInSelectors))
    state = 'signedOut';

  return {
    state,
    avatarUrl: img?.currentSrc || img?.src || null,
    name: config.readAccountName?.() ?? null,
  };
}

interface AccountButtonProps {
  config: AccountButtonConfig;
  className?: string;
}

export const AccountButton = ({ config, className }: AccountButtonProps) => {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [account, setAccount] = useState<NativeAccount>(() =>
    readNativeAccount(config),
  );
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    const sample = () => {
      const next = readNativeAccount(config);
      setAccount((prev) =>
        prev.state === next.state &&
        prev.avatarUrl === next.avatarUrl &&
        prev.name === next.name
          ? prev
          : next,
      );
    };
    sample();
    const interval = setInterval(sample, POLL_MS);
    return () => clearInterval(interval);
  }, [config]);

  useEffect(() => setImageBroken(false), [account.avatarUrl]);

  // Nothing to delegate to. Happens on Gemini before the sidenav footer has
  // rendered, and would happen on any platform whose markup has moved on.
  if (account.state === 'unavailable') return null;

  const signedOut = account.state === 'signedOut';
  const label = signedOut
    ? t('tooltip.signIn')
    : account.name || t('tooltip.account');

  const handleClick = () => {
    const target = queryFirst(
      signedOut ? (config.signInSelectors ?? []) : config.menuSelectors,
    );
    if (!target) {
      console.warn('Better Sidebar: native account control not found');
      return;
    }
    clickHiddenNativeElement(target, {
      getAnchorRect: () => buttonRef.current?.getBoundingClientRect() ?? null,
      popupSelectors: config.popupSelectors,
    });
  };

  return (
    <SimpleTooltip content={label}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={handleClick}
        className={cn('sidebar-btn transition-all', className)}
        aria-label={label}
      >
        {!signedOut && account.avatarUrl && !imageBroken ? (
          <img
            src={account.avatarUrl}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
            className="sidebar-avatar"
          />
        ) : (
          // Two cases land here: signed out, and signed in with an avatar that
          // has not arrived yet. Both get the same person-in-a-circle glyph — it
          // reads as an avatar placeholder, which is what the button is, and it
          // keeps the rail from reflowing when the image lands.
          <CircleUserRound className="sidebar-icon" />
        )}
      </Button>
    </SimpleTooltip>
  );
};
