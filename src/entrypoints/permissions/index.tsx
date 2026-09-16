import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import {
  applyCachedExtensionPageTheme,
  syncExtensionPageTheme,
} from '@/shared/lib/extension-page-theme';

/**
 * Lightweight extension page for requesting optional host permissions.
 *
 * Content scripts can't call chrome.permissions.request() directly.
 * This page is opened in a new tab, requests the permission with
 * user gesture, then auto-closes and notifies the opener.
 *
 * URL format: chrome-extension://<id>/permissions.html?origins=https://api.notion.com/*
 */

// Replay the cached theme synchronously, before anything is painted, then
// reconcile with the stored preference. Without this the design tokens are
// never defined on <html> and the page falls back to unstyled black-on-white.
applyCachedExtensionPageTheme();
void syncExtensionPageTheme();

const PermissionsPage = () => {
  const [status, setStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [origins, setOrigins] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const originsParam = params.get('origins');
    if (originsParam) {
      setOrigins(originsParam.split(','));
    }
  }, []);

  const handleGrant = async () => {
    if (origins.length === 0) return;

    const granted = await new Promise<boolean>((resolve) => {
      chrome.permissions.request({ origins }, (result) => {
        resolve(result);
      });
    });

    if (granted) {
      setStatus('granted');
      // Notify any listeners via storage event
      await browser.storage.local.set({ _permission_granted: Date.now() });
      // Auto-close after a short delay
      setTimeout(() => window.close(), 800);
    } else {
      setStatus('denied');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Grant Permission</h1>
          <p className="text-muted-foreground text-sm">
            This extension needs permission to access:
          </p>
          {origins.map((origin) => (
            <code key={origin} className="block text-sm bg-muted px-3 py-1 rounded">
              {origin}
            </code>
          ))}
        </div>

        {status === 'pending' && (
          <button
            onClick={handleGrant}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
          >
            Allow Access
          </button>
        )}

        {status === 'granted' && (
          <p className="text-success font-medium">
            ✓ Permission granted. This tab will close automatically.
          </p>
        )}

        {status === 'denied' && (
          <div className="space-y-3">
            <p className="text-destructive font-medium">
              Permission denied. You can try again or close this tab.
            </p>
            <button
              onClick={handleGrant}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PermissionsPage />
  </React.StrictMode>,
);
