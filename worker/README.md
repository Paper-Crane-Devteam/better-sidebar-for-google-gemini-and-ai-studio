# Better Sidebar License Worker

Cloudflare Worker for license validation. Supports Gumroad and custom (爱发电) tokens.

## Setup

```bash
cd worker
npm install
```

## Configuration

1. Create a KV namespace:
   ```bash
   wrangler kv:namespace create LICENSES
   ```

2. Update `wrangler.toml` with the KV namespace ID.

3. Set secrets:
   ```bash
   wrangler secret put SIGNING_KEY
   wrangler secret put GUMROAD_ACCESS_TOKEN
   ```

4. Update `GUMROAD_PRODUCT_ID` in `wrangler.toml`.

## Generate Tokens (爱发电)

```bash
npm run generate-tokens -- --count 10 --tier SP
npm run generate-tokens -- --count 5 --tier PRO
```

Then seed the tokens into KV using the outputted wrangler commands.

## Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

## API

### POST /activate

Request:
```json
{
  "token": "BS-SP-A7K2M9X4",
  "device_id": "uuid-here",
  "source": "afdian_sp"
}
```

Response (success):
```json
{
  "valid": true,
  "tier": "support_pack",
  "signed_payload": "base64-encoded-signed-json"
}
```

Response (error):
```json
{
  "valid": false,
  "error": "token_not_found"
}
```

### Error codes

- `missing_fields` — request body incomplete
- `token_not_found` — custom token not in KV
- `max_devices_reached` — too many devices activated
- `gumroad_rejected` — Gumroad says the key is invalid
- `license_revoked` — refunded or chargebacked
- `gumroad_api_error` — Gumroad API unreachable
- `invalid_token_format` — client-side: unrecognized format
- `network_error` — client-side: fetch failed
