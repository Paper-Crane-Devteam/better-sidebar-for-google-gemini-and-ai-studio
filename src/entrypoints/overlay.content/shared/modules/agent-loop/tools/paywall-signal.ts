/**
 * How a licence block is reported, and how the engine recognises it.
 *
 * Lived in `execute-sql.ts` while the database was the only thing behind the paywall.
 * The workspace has its own limits now, and a second tool family importing from the SQL
 * tool to learn how to say "upgrade" is a dependency that describes nothing.
 *
 * A *prefix* rather than a word anywhere in the text, because the engine ends the session
 * on seeing it. It used to test `result.includes('PAYWALL')`, which reads the whole
 * result — so a plain SELECT whose rows happened to contain the word (dumping
 * `messages.content` is routine, and a conversation about subscriptions will contain it)
 * ended the session and showed the upgrade card, for a query that was never blocked.
 *
 * Same reasoning as `ERROR:` / `CANCELLED:` elsewhere: only the first line is the
 * verdict, the rest is data.
 */
export const PAYWALL_SIGNAL = 'ERROR: PAYWALL';

/**
 * Build a blocked-by-licence tool result.
 *
 * `reason` is written for the model, not the user: it should say what was refused and
 * that an upgrade prompt is already on screen, so the AI reports the situation instead of
 * retrying the same call with a different path.
 */
export function paywallResult(reason: string): string {
  return `${PAYWALL_SIGNAL} - ${reason}`;
}
