/**
 * License activation API client.
 *
 * Communicates with the Cloudflare Worker to validate tokens.
 * Supports both Gumroad license keys and custom BS-SP / BS-PRO tokens.
 */

import type { LicenseTier } from './license-store';

/** The base URL of the license validation worker */
const LICENSE_API_URL = import.meta.env.VITE_LICENSE_API_URL;

/** Validation duration: 14 days in milliseconds */
const VALIDATION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export interface ActivationResult {
  success: boolean;
  tier: LicenseTier;
  signedPayload: string;
  /** End of the cached validation window (ms). Never later than `endsAt`. */
  expiresAt: number;
  /**
   * Hard end (ms) of a time-limited license (trial code, promo key), from the
   * server's `expires_at`. Null for lifetime licenses.
   */
  endsAt: number | null;
  error?: string;
}

/**
 * Fold the server's finer `reason` into the error code the client acts on.
 * Expired / already-redeemed campaign codes arrive as `license_revoked` /
 * `max_devices_reached` (which older clients already understand) plus a reason.
 */
function resolveError(data: { error?: string; reason?: string }, fallback: string): string {
  if (data.reason === 'trial_expired') return 'trial_expired';
  if (data.reason === 'code_already_used') return 'code_already_used';
  return data.error || fallback;
}

/** Parse the server's `expires_at`; null when absent or malformed. */
function parseEndsAt(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Identify the token source based on format.
 * - BS-SP-XXXXXXXX → afdian support pack
 * - BS-PP-XXXXXXXX → afdian power pack
 * - BS-PRO-XXXXXXXX → afdian pro
 * - XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX → Gumroad license key
 */
export function identifyTokenSource(token: string): 'afdian_sp' | 'afdian_pp' | 'afdian_pro' | 'gumroad' | 'unknown' {
  const trimmed = token.trim().toUpperCase();
  if (/^BS-SP-[A-Z0-9]{6,12}$/.test(trimmed)) return 'afdian_sp';
  if (/^BS-PP-[A-Z0-9]{6,12}$/.test(trimmed)) return 'afdian_pp';
  if (/^BS-PRO-[A-Z0-9]{6,12}$/.test(trimmed)) return 'afdian_pro';
  // Gumroad format: 8 hex chars separated by dashes (case insensitive)
  if (/^[A-F0-9]{8}(-[A-F0-9]{8}){3}$/.test(trimmed)) return 'gumroad';
  return 'unknown';
}

/**
 * Activate a license token by calling the validation worker.
 */
export async function activateLicense(
  token: string,
  deviceId: string,
): Promise<ActivationResult> {
  const source = identifyTokenSource(token);

  if (source === 'unknown') {
    return {
      success: false,
      tier: 'none',
      signedPayload: '',
      expiresAt: 0,
      endsAt: null,
      error: 'invalid_token_format',
    };
  }

  try {
    const response = await fetch(`${LICENSE_API_URL}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.trim().toUpperCase(),
        device_id: deviceId,
        source,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
      };
      return {
        success: false,
        tier: 'none',
        signedPayload: '',
        expiresAt: 0,
        endsAt: null,
        error: resolveError(errorData, `http_${response.status}`),
      };
    }

    const data = await response.json() as {
      valid: boolean;
      tier: string;
      signed_payload: string;
      expires_at?: string;
      error?: string;
      reason?: string;
    };

    if (!data.valid) {
      return {
        success: false,
        tier: 'none',
        signedPayload: '',
        expiresAt: 0,
        endsAt: null,
        error: resolveError(data, 'validation_failed'),
      };
    }

    const tier: LicenseTier =
      data.tier === 'pro' ? 'pro' :
      data.tier === 'power_pack' ? 'power_pack' : 'support_pack';

    // Time-limited licenses must not be cached past their end.
    const endsAt = parseEndsAt(data.expires_at);
    const cacheUntil = Date.now() + VALIDATION_DURATION_MS;

    return {
      success: true,
      tier,
      signedPayload: data.signed_payload,
      expiresAt: endsAt ? Math.min(cacheUntil, endsAt) : cacheUntil,
      endsAt,
    };
  } catch (err) {
    return {
      success: false,
      tier: 'none',
      signedPayload: '',
      expiresAt: 0,
      endsAt: null,
      error: 'network_error',
    };
  }
}

/**
 * Re-validate an existing token (silent background check).
 */
export async function revalidateLicense(
  token: string,
  deviceId: string,
): Promise<ActivationResult> {
  return activateLicense(token, deviceId);
}

/**
 * How a failed validation should be treated.
 *
 * - `unreachable` — we never got a verdict (offline, DNS, 5xx, rate limited).
 *   The license must survive this; retry later.
 * - `rejected` — the server gave a verdict and it was "no" (refund, revoke,
 *   unknown token). The entitlement should end.
 */
export interface ReleaseResult {
  success: boolean;
  /** True when a slot was actually freed (false means it was already free). */
  released: boolean;
  error?: string;
}

/**
 * Release this device's activation slot on the server.
 *
 * Sends the signed payload from activation as proof, so the server can confirm
 * this caller really owns the slot it's giving up. Without it, anyone holding a
 * shared token could kick other people off.
 */
export async function releaseLicense(
  token: string,
  signedPayload: string,
): Promise<ReleaseResult> {
  if (!signedPayload) {
    return { success: false, released: false, error: 'missing_signed_payload' };
  }

  try {
    const response = await fetch(`${LICENSE_API_URL}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.trim().toUpperCase(),
        signed_payload: signedPayload,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      released?: boolean;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      return {
        success: false,
        released: false,
        error: data.error || `http_${response.status}`,
      };
    }

    return { success: true, released: !!data.released };
  } catch {
    return { success: false, released: false, error: 'network_error' };
  }
}

export type ValidationFailure = 'unreachable' | 'rejected';

/**
 * Error codes that mean "the server answered, and the answer is no".
 * Anything not listed is treated as `unreachable`, which is the safe default:
 * a bug or a new error code should never silently strip a paying user's license.
 */
const REJECTION_CODES = new Set([
  'token_not_found',
  'license_revoked',
  'gumroad_rejected',
  'gumroad_invalid',
  'invalid_token_format',
  'invalid_source',
  'missing_token',
  'unknown_source',
  'max_devices_reached',
  // Folded from the server's `reason` (see resolveError).
  'trial_expired',
  'code_already_used',
]);

export function classifyValidationFailure(error: string | undefined): ValidationFailure {
  if (!error) return 'unreachable';
  return REJECTION_CODES.has(error) ? 'rejected' : 'unreachable';
}
