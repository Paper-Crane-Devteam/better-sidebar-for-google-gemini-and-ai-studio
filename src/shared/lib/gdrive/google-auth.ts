/**
 * Google OAuth authentication using chrome.identity.launchWebAuthFlow()
 * with Authorization Code + PKCE flow for persistent sessions.
 *
 * Unlike the implicit grant flow, this obtains a refresh_token that
 * survives browser restarts indefinitely — no more re-login after a day.
 */

import axios from 'axios';

const OAUTH_CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = import.meta.env.VITE_OAUTH_CLIENT_SECRET;
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Storage keys
const ACCESS_TOKEN_KEY = 'gdrive_auth_token';
const TOKEN_EXPIRY_KEY = 'gdrive_auth_token_expiry';
const REFRESH_TOKEN_KEY = 'gdrive_refresh_token';

export interface AuthStatus {
  isAuthenticated: boolean;
  expiresAt?: number;
}

// ─── PKCE helpers ────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Environment check ───────────────────────────────────────────

/**
 * Check if the current environment supports Google Identity API.
 * Returns true if running in background context.
 */
export function isGdriveAuthSupported(): boolean {
  return (
    typeof browser !== 'undefined' &&
    typeof chrome !== 'undefined' &&
    !!chrome.identity?.launchWebAuthFlow
  );
}

// ─── Token storage ───────────────────────────────────────────────

async function getCachedToken(): Promise<string | null> {
  const result = await browser.storage.local.get([ACCESS_TOKEN_KEY, TOKEN_EXPIRY_KEY]);
  const token = result[ACCESS_TOKEN_KEY] as string | undefined;
  const expiry = result[TOKEN_EXPIRY_KEY] as number | undefined;

  if (!token) return null;

  // Expired (with 5 min buffer) → don't return, but DON'T clear refresh token
  if (expiry && Date.now() > expiry - 5 * 60 * 1000) {
    await browser.storage.local.remove([ACCESS_TOKEN_KEY, TOKEN_EXPIRY_KEY]);
    return null;
  }

  return token;
}

async function storeTokens(
  accessToken: string,
  expiresIn: number,
  refreshToken?: string,
): Promise<void> {
  const data: Record<string, any> = {
    [ACCESS_TOKEN_KEY]: accessToken,
    [TOKEN_EXPIRY_KEY]: Date.now() + expiresIn * 1000,
  };
  if (refreshToken) {
    data[REFRESH_TOKEN_KEY] = refreshToken;
  }
  await browser.storage.local.set(data);
}

async function getStoredRefreshToken(): Promise<string | null> {
  const result = await browser.storage.local.get(REFRESH_TOKEN_KEY);
  return (result[REFRESH_TOKEN_KEY] as string) || null;
}

async function clearAllTokens(): Promise<void> {
  await browser.storage.local.remove([ACCESS_TOKEN_KEY, TOKEN_EXPIRY_KEY, REFRESH_TOKEN_KEY]);
}

// ─── OAuth URL builders ──────────────────────────────────────────

function buildAuthUrl(codeChallenge: string): string {
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  return authUrl.toString();
}

function extractCodeFromUrl(responseUrl: string): string {
  const url = new URL(responseUrl);
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('Failed to obtain authorization code from OAuth response');
  }
  return code;
}

// ─── Token exchange & refresh ────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const redirectUrl = chrome.identity.getRedirectURL();
  const response = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUrl,
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in || 3600,
    refreshToken: response.data.refresh_token,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const response = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in || 3600,
  };
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Try to silently refresh the token using stored refresh_token.
 * No user interaction needed. Returns null if refresh is not possible.
 */
export async function silentRefresh(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);
    await storeTokens(accessToken, expiresIn);
    return accessToken;
  } catch (err: any) {
    // If refresh token is revoked/invalid (400/401), clear everything
    const status = err?.response?.status;
    if (status === 400 || status === 401) {
      console.warn('[GoogleAuth] Refresh token invalid, clearing tokens');
      await clearAllTokens();
    }
    return null;
  }
}

/**
 * Launch interactive OAuth2 flow using Authorization Code + PKCE.
 * Obtains both access_token and refresh_token.
 */
export async function authenticate(): Promise<string> {
  if (!isGdriveAuthSupported()) {
    throw new Error('Google Drive authentication is not supported in this browser');
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: buildAuthUrl(codeChallenge), interactive: true },
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

  const code = extractCodeFromUrl(responseUrl);
  const { accessToken, expiresIn, refreshToken } = await exchangeCodeForTokens(code, codeVerifier);
  await storeTokens(accessToken, expiresIn, refreshToken);
  return accessToken;
}

/**
 * Get a valid access token.
 * Priority: cached → refresh_token → interactive auth.
 */
export async function getAccessToken(noInteractive = false): Promise<string> {
  const cached = await getCachedToken();
  if (cached) return cached;

  // Try refresh token first (works across browser restarts)
  const refreshed = await silentRefresh();
  if (refreshed) return refreshed;

  if (noInteractive) {
    throw new Error('Token expired and interactive auth is disabled');
  }

  return authenticate();
}

/**
 * Revoke the current token and clear all stored tokens.
 */
export async function disconnect(): Promise<void> {
  // Try revoking the access token first, then refresh token
  const result = await browser.storage.local.get([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  const tokenToRevoke = (result[ACCESS_TOKEN_KEY] || result[REFRESH_TOKEN_KEY]) as string | undefined;

  if (tokenToRevoke) {
    try {
      await axios.post(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
      );
    } catch {
      // Continue even if revocation fails
    }
  }
  await clearAllTokens();
}

/**
 * Get the current authentication status.
 * Considers the user authenticated if we have a refresh_token OR a valid access_token.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await browser.storage.local.get([
    ACCESS_TOKEN_KEY,
    TOKEN_EXPIRY_KEY,
    REFRESH_TOKEN_KEY,
  ]);

  const accessToken = result[ACCESS_TOKEN_KEY] as string | undefined;
  const expiry = result[TOKEN_EXPIRY_KEY] as number | undefined;
  const refreshToken = result[REFRESH_TOKEN_KEY] as string | undefined;

  // Has refresh token → always considered authenticated (can refresh silently)
  if (refreshToken) {
    return {
      isAuthenticated: true,
      expiresAt: expiry,
    };
  }

  // Fallback: check access token validity
  if (!accessToken || (expiry && Date.now() > expiry - 5 * 60 * 1000)) {
    return { isAuthenticated: false };
  }

  return {
    isAuthenticated: true,
    expiresAt: expiry,
  };
}
