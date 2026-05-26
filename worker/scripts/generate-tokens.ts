/**
 * Token generation script for 爱发电 (Afdian) purchases.
 *
 * Usage:
 *   npx tsx scripts/generate-tokens.ts --count 10 --tier SP
 *   npx tsx scripts/generate-tokens.ts --count 5 --tier PRO
 *
 * This generates tokens and outputs them as JSON.
 * You then need to seed them into KV using wrangler:
 *   wrangler kv:key put --binding LICENSES "license:BS-SP-XXXXXXXX" '{"source":"afdian_sp","tier":"support_pack","devices":[],"maxDevices":3,"createdAt":"..."}'
 */

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion

function generateCode(length = 8): string {
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    code += CHARS[array[i] % CHARS.length];
  }
  return code;
}

function generateToken(tier: 'SP' | 'PRO'): string {
  return `BS-${tier}-${generateCode(8)}`;
}

// Parse CLI args
const args = process.argv.slice(2);
const countIdx = args.indexOf('--count');
const tierIdx = args.indexOf('--tier');

const count = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 10;
const tier = (tierIdx !== -1 ? args[tierIdx + 1] : 'SP') as 'SP' | 'PRO';

const kvTier = tier === 'PRO' ? 'pro' : 'support_pack';
const kvSource = tier === 'PRO' ? 'afdian_pro' : 'afdian_sp';

interface TokenEntry {
  token: string;
  kvKey: string;
  kvValue: {
    source: string;
    tier: string;
    devices: string[];
    maxDevices: number;
    createdAt: string;
  };
}

const tokens: TokenEntry[] = [];
const now = new Date().toISOString();

for (let i = 0; i < count; i++) {
  const token = generateToken(tier);
  tokens.push({
    token,
    kvKey: `license:${token}`,
    kvValue: {
      source: kvSource,
      tier: kvTier,
      devices: [],
      maxDevices: 3,
      createdAt: now,
    },
  });
}

// Output
console.log(JSON.stringify(tokens, null, 2));

// Also output wrangler commands for easy seeding
console.log('\n--- Wrangler KV seed commands ---\n');
for (const entry of tokens) {
  console.log(
    `wrangler kv:key put --binding LICENSES "${entry.kvKey}" '${JSON.stringify(entry.kvValue)}'`,
  );
}
