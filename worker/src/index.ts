/**
 * Better Sidebar License Validation Worker
 *
 * Cloudflare Worker that validates license tokens from:
 * - Gumroad (international purchases)
 * - Custom BS-SP / BS-PRO tokens (爱发电 purchases)
 *
 * KV Structure:
 *   key: "license:{TOKEN}"
 *   value: JSON { source, tier, devices: string[], maxDevices, createdAt }
 */

export interface Env {
  LICENSES: KVNamespace;
  GUMROAD_PRODUCT_ID: string;
  MAX_DEVICES: string;
  /** Gumroad API access token (set as secret) */
  GUMROAD_ACCESS_TOKEN?: string;
  /** HMAC signing key for response payloads (set as secret) */
  SIGNING_KEY: string;
}

interface LicenseRecord {
  source: 'gumroad' | 'afdian_sp' | 'afdian_pro';
  tier: 'support_pack' | 'pro';
  devices: string[];
  maxDevices: number;
  createdAt: string;
  gumroadData?: Record<string, unknown>;
}

interface ActivateRequest {
  token: string;
  device_id: string;
  source: 'gumroad' | 'afdian_sp' | 'afdian_pro';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/activate' && request.method === 'POST') {
      try {
        const body = (await request.json()) as ActivateRequest;
        const result = await handleActivate(body, env);
        return new Response(JSON.stringify(result), {
          status: result.valid ? 200 : 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ valid: false, error: 'internal_error' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

async function handleActivate(
  body: ActivateRequest,
  env: Env,
): Promise<{ valid: boolean; tier?: string; signed_payload?: string; error?: string }> {
  const { token, device_id, source } = body;

  if (!token || !device_id || !source) {
    return { valid: false, error: 'missing_fields' };
  }

  const maxDevices = parseInt(env.MAX_DEVICES || '3', 10);
  const kvKey = `license:${token}`;

  // --- Gumroad validation ---
  if (source === 'gumroad') {
    const gumroadResult = await verifyGumroad(token, env);
    if (!gumroadResult.valid) {
      return { valid: false, error: gumroadResult.error || 'gumroad_invalid' };
    }

    // Check/create KV record for device tracking
    let record = await getRecord(env.LICENSES, kvKey);
    if (!record) {
      record = {
        source: 'gumroad',
        tier: 'support_pack',
        devices: [device_id],
        maxDevices,
        createdAt: new Date().toISOString(),
        gumroadData: gumroadResult.data,
      };
      await env.LICENSES.put(kvKey, JSON.stringify(record));
    } else {
      // Add device if not already registered
      if (!record.devices.includes(device_id)) {
        if (record.devices.length >= record.maxDevices) {
          return { valid: false, error: 'max_devices_reached' };
        }
        record.devices.push(device_id);
        await env.LICENSES.put(kvKey, JSON.stringify(record));
      }
    }

    const signedPayload = await signPayload(
      { valid: true, tier: record.tier, token, device_id },
      env.SIGNING_KEY,
    );

    return { valid: true, tier: record.tier, signed_payload: signedPayload };
  }

  // --- Custom token (爱发电) validation ---
  if (source === 'afdian_sp' || source === 'afdian_pro') {
    const record = await getRecord(env.LICENSES, kvKey);
    if (!record) {
      return { valid: false, error: 'token_not_found' };
    }

    // Check device limit
    if (!record.devices.includes(device_id)) {
      if (record.devices.length >= record.maxDevices) {
        return { valid: false, error: 'max_devices_reached' };
      }
      record.devices.push(device_id);
      await env.LICENSES.put(kvKey, JSON.stringify(record));
    }

    const signedPayload = await signPayload(
      { valid: true, tier: record.tier, token, device_id },
      env.SIGNING_KEY,
    );

    return { valid: true, tier: record.tier, signed_payload: signedPayload };
  }

  return { valid: false, error: 'unknown_source' };
}

/** Verify a Gumroad license key via their API */
async function verifyGumroad(
  licenseKey: string,
  env: Env,
): Promise<{ valid: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: env.GUMROAD_PRODUCT_ID,
        license_key: licenseKey,
        increment_uses_count: 'false',
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data.success === true) {
      // Check if refunded or chargebacked
      const purchase = data.purchase as Record<string, unknown> | undefined;
      if (purchase?.refunded || purchase?.chargebacked) {
        return { valid: false, error: 'license_revoked' };
      }
      return { valid: true, data };
    }

    return { valid: false, error: 'gumroad_rejected' };
  } catch {
    return { valid: false, error: 'gumroad_api_error' };
  }
}

/** Get a license record from KV */
async function getRecord(
  kv: KVNamespace,
  key: string,
): Promise<LicenseRecord | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LicenseRecord;
  } catch {
    return null;
  }
}

/** Sign a payload using HMAC-SHA256 */
async function signPayload(
  payload: Record<string, unknown>,
  signingKey: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = JSON.stringify(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Return base64-encoded JSON with signature
  const result = JSON.stringify({ payload: data, sig: sigHex });
  return btoa(result);
}
