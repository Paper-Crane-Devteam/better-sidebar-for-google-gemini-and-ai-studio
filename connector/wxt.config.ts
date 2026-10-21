import { defineConfig } from 'wxt';
import { MAIN_EXTENSION_ID } from '../src/shared/web-agent/connector-protocol';

/**
 * Better Sidebar Web Agent Connector — a separate extension that holds `debugger` so the main
 * one does not have to. Design: §16 of `.kiro/docs/web-agent-technical-design.md`.
 *
 *   npm run build:connector   → connector/.output/chrome-mv3 (load unpacked)
 *   npm run zip:connector     → zip for the Chrome Web Store
 *
 * ⚠️ The permissions below are frozen. Adding a warned permission in an update disables the
 * Connector until every user re-approves it, which is the exact problem it exists to avoid.
 */
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Better Sidebar Web Agent Connector',
    short_name: 'Web Agent Connector',
    description: "Lets Better Sidebar's Web Agent operate the tabs you choose. Requires Better Sidebar.",
    /**
     * The Web Store public key (dashboard → Package → View public key). Fixes the id to
     * `CONNECTOR_EXTENSION_ID` so dev and store builds share one id.
     */
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtKwQZ4tDggBQmHmWEYdhs3AoH2riRUFKvL+rSJjwoPc5EZCpKRAHM7awPz9VVnUdvjQqsmBWpgtSfaV/isGVpUm7Ru0e2wFqWzzc+29H7jyggvauKkNf6WDeTmd+ohnuSMMwtbsS2E3d1Cb5SY9J2Etk2mD2153ymXuCjq2RXzkG6ifOw5nm+LVs27C4qDBTyRLZBuBROa+jwnXmtsr7Ky97qLR8kpUMnJypsG82AkmV0v86vX2ua722alxNT2MRFvMEVapNftGNQLI8btvfkPP1ltbCd2gwegyD66wjLyBnkj693uwmeMrHqPLJMPMNwj+ssDVinMsdZi4R013ccQIDAQAB',
    icons: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    permissions: ['debugger', 'storage'],
    // Only Better Sidebar may call in. No `matches`, so no web page can either.
    externally_connectable: { ids: [MAIN_EXTENSION_ID] },
    action: { default_title: 'Web Agent Connector' },
  },
  // Not run on its own: load the build into the main extension's dev browser instead.
  webExt: { disabled: true },
});
