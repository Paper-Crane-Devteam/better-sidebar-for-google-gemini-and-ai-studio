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
  expiresAt: number;
  error?: string;
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
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        tier: 'none',
        signedPayload: '',
        expiresAt: 0,
        error: (errorData as any).error || `http_${response.status}`,
      };
    }

    const data = await response.json() as {
      valid: boolean;
      tier: string;
      signed_payload: string;
      error?: string;
    };

    if (!data.valid) {
      return {
        success: false,
        tier: 'none',
        signedPayload: '',
        expiresAt: 0,
        error: data.error || 'validation_failed',
      };
    }

    const tier: LicenseTier =
      data.tier === 'pro' ? 'pro' :
      data.tier === 'power_pack' ? 'power_pack' : 'support_pack';

    return {
      success: true,
      tier,
      signedPayload: data.signed_payload,
      expiresAt: Date.now() + VALIDATION_DURATION_MS,
    };
  } catch (err) {
    return {
      success: false,
      tier: 'none',
      signedPayload: '',
      expiresAt: 0,
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
]);

export function classifyValidationFailure(error: string | undefined): ValidationFailure {
  if (!error) return 'unreachable';
  return REJECTION_CODES.has(error) ? 'rejected' : 'unreachable';
}
