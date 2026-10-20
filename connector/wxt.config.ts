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
     * Fixes the id (see `CONNECTOR_EXTENSION_ID`). ⚠️ A locally generated key until the first
     * Web Store upload; then replace it with the public key from the store dashboard
     * (Package → View public key) so dev and store builds share one id.
     */
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlMa9STBy32yREPQQKXllWu5b9qnkSU3xWrTVbXWVidWWfBPjaDT20V1IHHLsR89TVQ/1o5zfZK0yACIDVP8WnTvu4Ms6spms5vPVsaJ+zkNcvrPZtsb2+eYjdxFhBCkybkuubyimXqnVouTRN1cRE2no69FLoOf6YJm0YpVXil1bzsl1ZwhBCMRlaNlP2B6xaREoLDCRvQIJ0z9+nx4ppwFKI6yGa4WUL0qwnBdBixwd4RdTl6zgzX8xywVZg0+jcDtdFfe5Qlo61PDcLs7X3JJXJHJBccI367gDwTK2wHEZ68OHCySraNLmAzHakUraWZf4BFqK5ewmV8V7nUKdKQIDAQAB',
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
