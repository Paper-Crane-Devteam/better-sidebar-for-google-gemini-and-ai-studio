import { defineConfig } from 'wxt';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser: targetBrowser }) => ({
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAslGk7j3hhuEYll5z4H5ccdnAdYQLjd1PCDAEM2I4EBeCzuIjW6MV9hJLbo45B9dthDBZO+vYVS6tqFSv1TYu1Kt03POt0YK6O7vq2MOT87HxoC/NIGUF9ovbWG6wVByNk+YeOGF0EUmMYB7fklq+AHvdVvg5hFUTIdMEYf44SeJpELm+hN2AY1TLJG+g+ZmmB1u2zmEvnnH7QsVpRKSDVFMoxKpYQgGgNpdb+YUj6e+WnWHHxv4ErpJR5O3E8PlCiynigPG6V+QrkyRxf7V657n1yR8+GnrSWn3DhZXmR1tdYbfcYfqj3Sb4m1Bwq/wrftv3+TxSSEYOJkleDe2UhQIDAQAB',
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    permissions: [
      // 'sidePanel',
      'unlimitedStorage',
      'storage',
      'alarms',
      // 'tabs', // Removed to speed up review, we have host permissions
      'scripting',
      'offscreen',
      'identity',
    ],
    optional_permissions: targetBrowser === 'chrome' ? ['tabs', 'tabGroups', 'bookmarks'] : [],
    host_permissions: [
      'https://aistudio.google.com/*',
      'https://gemini.google.com/*',
      // 'https://chatgpt.com/*',
    ],
    optional_host_permissions: [
      'https://api.notion.com/*',
    ],
    // Temporarily disabled: sidepanel entry point (action button)
    // action: {
    //   default_title: 'Click to open side panel',
    //   default_icon: {
    //     "16": "icons/icon.png",
    //     "48": "icons/icon.png",
    //     "128": "icons/icon.png",
    //   },
    // },
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    browser_specific_settings: {
      gecko: {
        id: 'better-sidebar@zhangyu91101313.gmail.com',
        strict_min_version: '109.0',
        // @ts-ignore: Firefox 140+ data collection permissions
        data_collection_permissions: {
          required: ['none'],
          optional: [],
        },
      },
    },
    web_accessible_resources: [
      {
        resources: [
          'main-world.js',
          'wa-sqlite-async.mjs',
          'wa-sqlite-async.wasm',
          // Screenshots/QR shown inside the injected sidebar. They are kept in
          // public/ and loaded by URL so they are not inlined as base64 into
          // content-scripts/overlay.js (see ImportHistoryDialog.tsx).
          'images/*',
        ],
        matches: [
          'https://aistudio.google.com/*',
          'https://gemini.google.com/*',
          // 'https://chatgpt.com/*',
        ],
      },
    ],
  }),
  zip: {
    // Drop orphaned KaTeX font files (~0.78 MB). scripts/postcss-woff2-only.mjs
    // strips the woff/truetype sources from katex's @font-face rules, but Vite
    // resolves url() before our PostCSS plugin runs, so it has already emitted
    // those files by the time the declarations are rewritten. Nothing in the
    // build references them; only the 19 woff2 files are actually used.
    // Patterns are matched against paths relative to the output dir, and
    // `*.woff` does not match `*.woff2`.
    exclude: ['assets/KaTeX_*.ttf', 'assets/KaTeX_*.woff'],
    // Firefox reviewers must be able to reproduce the exact uploaded build.
    // `.env` holds the build-time constants injected via `import.meta.env.VITE_*`
    // (OAuth client id/secret, license API URL, EmailJS ids). Without it those
    // become `undefined` and the output bytes differ from the published XPI.
    // These values are already visible in plain text inside the shipped bundle,
    // so including them here exposes nothing new. `includeSources` takes
    // precedence over WXT's default `excludeSources` (which drops all dotfiles).
    includeSources: ['.env'],
    // Keep credentials, reference docs and scratch files out of the source zip.
    excludeSources: [
      'misc/**',
      'doc/**',
      'feature-summary.md',
      'temp.md',
      'test.html',
      'landing.html',
      'landing-official.html',
    ],
  },
  vite: (env) => ({
    plugins: [
      viteStaticCopy({
        targets: [
          // Copy all SQLite WASM assets to assets/ (for Worker default relative path resolution)
          {
            src: 'src/assets/wa-sqlite-fts5/*',
            dest: 'assets',
          },
        ],
      }),
    ],
    worker: {
      rollupOptions: {
        output: {
          // Use fixed file names for worker assets (no hash) so offscreen.ts
          // can reference them via chrome.runtime.getURL() with a known path.
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
        },
      },
    },
    optimizeDeps: {
      exclude: ['wa-sqlite'],
    },
    esbuild: {
      // Only drop console and debugger in production mode
      ...(env.mode === 'production' && {
        pure: ['console.log', 'console.debug', 'console.info'],
        drop: ['debugger'],
      }),
    },
  }),
  webExt: {
    chromiumArgs: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
    ],
    firefoxArgs: ['--keep-profile-changes'],
    // Persist profile in a custom folder to keep login state
    chromiumProfile: path.resolve(process.cwd(), '.dev-profile'),
    firefoxProfile: path.resolve(process.cwd(), '.dev-profile-firefox'),
    keepProfileChanges: true,
  },
});
