/**
 * Google OAuth authentication using chrome.identity.launchWebAuthFlow()
 * Manages access tokens for Google Drive API access.
 */

import axios from 'axios';

// TODO: Replace with your actual OAuth Client ID from Google Cloud Console
const OAUTH_CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID;
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const TOKEN_STORAGE_KEY = 'gdrive_auth_token';
const TOKEN_EXPIRY_KEY = 'gdrive_auth_token_expiry';
const USER_EMAIL_KEY = 'gdrive_user_email';

export interface AuthStatus {
  isAuthenticated: boolean;
  userEmail?: string;
  expiresAt?: number;
}

/**
 * Check if the current environment supports Google Identity API
 * Returns true if running in background. For Content Script, call the background message for support status instead.
 */
export function isGdriveAuthSupported(): boolean {
  return (
    typeof browser !== 'undefined' &&
    typeof chrome !== 'undefined' &&
    !!chrome.identity?.launchWebAuthFlow
  );
}

/**
 * Get cached token from storage
 */
async function getCachedToken(): Promise<string | null> {
  const result = await browser.storage.local.get([
    TOKEN_STORAGE_KEY,
    TOKEN_EXPIRY_KEY,
  ]);
  const token = result[TOKEN_STORAGE_KEY] as string | undefined;
  const expiry = result[TOKEN_EXPIRY_KEY] as number | undefined;

  if (!token) return null;

  // Check if token is expired (with 5 min buffer)
  if (expiry && Date.now() > expiry - 5 * 60 * 1000) {
    await clearStoredToken();
    return null;
  }

  return token;
}

/**
 * Store token in local storage
 */
async function storeToken(
  token: string,
  expiresIn: number,
  email?: string,
): Promise<void> {
  const data: Record<string, any> = {
    [TOKEN_STORAGE_KEY]: token,
    [TOKEN_EXPIRY_KEY]: Date.now() + expiresIn * 1000,
  };
  if (email) {
    data[USER_EMAIL_KEY] = email;
  }
  await browser.storage.local.set(data);
}

/**
 * Clear stored token
 */
async function clearStoredToken(): Promise<void> {
  await browser.storage.local.remove([
    TOKEN_STORAGE_KEY,
    TOKEN_EXPIRY_KEY,
    USER_EMAIL_KEY,
  ]);
}

/**
 * Launch OAuth2 flow using chrome.identity.launchWebAuthFlow
 */
export async function authenticate(): Promise<string> {
  if (!isGdriveAuthSupported()) {
    throw new Error(
      'Google Drive authentication is not supported in this browser',
    );
  }

  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('prompt', 'consent');

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!callbackUrl) {
          reject(new Error('No callback URL received'));
          return;
        }
        resolve(callbackUrl);
      },
    );
  });

  // Extract access token from the callback URL hash fragment
  const url = new URL(responseUrl);
  const hashParams = new URLSearchParams(url.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);

  if (!accessToken) {
    throw new Error('Failed to obtain access token from OAuth response');
  }

  // Fetch user email for display
  let email: string | undefined;
  try {
    const res = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    email = res.data.email;
  } catch {
    // Non-critical, continue without email
  }

  await storeToken(accessToken, expiresIn, email);
  return accessToken;
}

/**
 * Get a valid access token, returning cached if available
 */
export async function getAccessToken(): Promise<string> {
  const cached = await getCachedToken();
  if (cached) return cached;
  return authenticate();
}

/**
 * Revoke the current token and clear storage
 */
export async function disconnect(): Promise<void> {
  const token = await getCachedToken();
  if (token) {
    try {
      await axios.post(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      );
    } catch {
      // Continue even if revocation fails
    }
  }
  await clearStoredToken();
}

/**
 * Get the current authentication status
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await browser.storage.local.get([
    TOKEN_STORAGE_KEY,
    TOKEN_EXPIRY_KEY,
    USER_EMAIL_KEY,
  ]);

  const token = result[TOKEN_STORAGE_KEY] as string | undefined;
  const expiry = result[TOKEN_EXPIRY_KEY] as number | undefined;
  const email = result[USER_EMAIL_KEY] as string | undefined;

  if (!token || (expiry && Date.now() > expiry - 5 * 60 * 1000)) {
    return { isAuthenticated: false };
  }

  return {
    isAuthenticated: true,
    userEmail: email || undefined,
    expiresAt: expiry,
  };
}
