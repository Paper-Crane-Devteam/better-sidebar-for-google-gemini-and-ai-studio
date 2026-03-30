import { Platform } from '@/shared/types/platform';
import { navigate } from '@/shared/lib/navigation';
import { waitForElement } from '@/shared/lib/utils';
import i18n from '@/locale/i18n';

const SCAN_TIMEOUT_MS = 30000;

export async function scanGems(): Promise<number> {
  console.log('Starting Gemini gem scan (DOM)...');

  // 1. Navigate to the gems view page
  navigate('https://gemini.google.com/gems/view');

  // 2. Wait for the gems container to appear
  const container = await waitForElement('.bots-section-container', SCAN_TIMEOUT_MS);
  if (!container) {
    console.warn('Gem scan: .bots-section-container not found');
    return 0;
  }

  // Small delay to let all rows render
  await new Promise((r) => setTimeout(r, 1500));

  // 3. Parse all gem rows from the DOM
  const rows = container.querySelectorAll('bot-list-row .bot-list-row-container a.bot-row');
  const gems: { id: string; name: string }[] = [];

  for (const row of Array.from(rows)) {
    try {
      const href = row.getAttribute('href') ?? '';
      // href format: /gem/929793edb212
      const match = href.match(/\/gem\/([^/?#]+)/);
      if (!match) continue;

      const id = match[1];
      const nameEl = row.querySelector('.title-container span');
      const name = nameEl?.textContent?.trim() || i18n.t('gems.untitledGem');

      gems.push({ id, name });
    } catch {
      // ignore individual row errors
    }
  }

  console.log(`Gem scan: Found ${gems.length} gems in DOM`);

  if (gems.length === 0) return 0;

  // 4. Deduplicate and save
  const unique = new Map(gems.map((g) => [g.id, g]));
  const payload = Array.from(unique.values()).map((gem) => ({
    id: gem.id,
    name: gem.name,
    external_id: gem.id,
    external_url: `https://gemini.google.com/gem/${gem.id}`,
    platform: Platform.GEMINI,
  }));

  await browser.runtime.sendMessage({
    type: 'SAVE_GEMS',
    payload: { gems: payload },
  });

  console.log(`Gem scan: Saved ${payload.length} gems`);
  return payload.length;
}
