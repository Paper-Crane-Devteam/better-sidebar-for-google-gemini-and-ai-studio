/**
 * Scan build output for code points that Chromium rejects in content scripts.
 *
 * Chromium validates content script files with base::IsStringUTF8, which refuses
 * noncharacters (U+FFFE/U+FFFF, U+FDD0-U+FDEF) and lone surrogates even though
 * they encode as perfectly valid UTF-8. Registration then fails with the
 * misleading "It isn't UTF-8 encoded" error, so the file never reaches the page.
 *
 * Usage: node scripts/scan-bad-codepoints.mjs [dir=.output/chrome-mv3-dev]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.output/chrome-mv3-dev';

const isRejected = (cp) =>
  (cp >= 0xd800 && cp <= 0xdfff) || (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|mjs)$/.test(name)) yield p;
  }
}

let total = 0;
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const hits = [];
  // Iterate by code point, not code unit: a well-formed surrogate pair (an emoji,
  // say) is legal and must not be flagged. Only unpaired surrogates are rejected,
  // and codePointAt on a valid pair returns the combined astral code point.
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    if (isRejected(cp)) hits.push({ i, cp });
    i += cp > 0xffff ? 2 : 1;
  }
  total += hits.length;
  const size = String(statSync(file).size).padStart(10);
  console.log(`${String(hits.length).padStart(3)} bad ${size}  ${file}`);
  for (const { i, cp } of hits.slice(0, 3)) {
    const hex = cp.toString(16).toUpperCase().padStart(4, '0');
    console.log(`      @${i} U+${hex}  ...${JSON.stringify(text.slice(i - 70, i + 10))}`);
  }
}
console.log(`\ntotal rejected code points: ${total}`);
process.exit(total === 0 ? 0 : 1);
