import { promptRepo } from '@/shared/db/operations';

/**
 * Seed 3 default prompts for first-time users so the Prompts tab isn't empty.
 * Idempotent: skips if any prompts already exist.
 */
export async function seedDefaultPrompts(): Promise<void> {
  try {
    const existing = await promptRepo.getAll();
    if (existing.length > 0) return;

    const now = Math.floor(Date.now() / 1000);

    const defaults = [
      {
        id: crypto.randomUUID(),
        title: 'Translate',
        content:
          'Translate the following text to {{language:English,Chinese,Japanese,Spanish,French,German,Korean,Portuguese,Russian}}:\n\n{{text}}',
        type: 'normal' as const,
        icon: 'MessageSquare',
        order_index: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Summarize',
        content:
          'Please summarize the following content concisely, highlighting the key points:\n\n{{content}}',
        type: 'normal' as const,
        icon: 'FileText',
        order_index: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Code Review',
        content:
          'Please review the following {{language:JavaScript,TypeScript,Python,Java,Go,Rust,C++,Other}} code. Focus on:\n- Potential bugs\n- Performance issues\n- Readability improvements\n\n```\n{{code}}\n```',
        type: 'normal' as const,
        icon: 'Code',
        order_index: 2,
        created_at: now,
        updated_at: now,
      },
    ];

    for (const p of defaults) {
      await promptRepo.create(p);
    }

    console.log('[Background] Seeded 3 default prompts for new user');
  } catch (err) {
    console.error('[Background] Failed to seed default prompts:', err);
  }
}
