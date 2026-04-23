import { defineConfig } from 'wxt';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
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
      // 'alarms',
      // 'tabs', // Removed to speed up review, we have host permissions
      'scripting',
      'offscreen',
      'identity',
    ],
    host_permissions: [
      'https://aistudio.google.com/*',
      'https://gemini.google.com/*',
      // 'https://chatgpt.com/*',
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
        ],
        matches: [
          'https://aistudio.google.com/*',
          'https://gemini.google.com/*',
          // 'https://chatgpt.com/*',
        ],
      },
    ],
  },
  vite: (env) => ({
    plugins: [
      viteStaticCopy({
        targets: [
          // Copy all SQLite WASM assets to root (for Main World and general access)
          // {
          //   src: 'node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/*',
          //   dest: '.',
          // },
          // Copy all SQLite WASM assets to assets/ (for Worker default relative path resolution)
          {
            src: 'src/assets/wa-sqlite-fts5/*',
            dest: 'assets',
          },
        ],
      }),
    ],
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
