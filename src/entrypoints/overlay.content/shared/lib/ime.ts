/**
 * Whether an IME is mid-composition, i.e. this keystroke is not ours to read.
 *
 * While a candidate list is up, Enter / Tab / Escape / the arrow keys all belong to the
 * input method: Enter commits the candidate, the arrows move through it, Escape cancels
 * it. Every keyboard handler we install on a composer has to stand down for the duration,
 * and none of them did.
 *
 * ⚠️ The bug this fixes was invisible to anyone typing only English, and looked like a
 * completely different feature being broken. Typing `帮我看下prompt` with Sogou: at
 * `prompt` the IME is showing letter candidates, and Enter is meant to commit the raw
 * letters. Our send interceptor claimed that Enter instead, so the message went out
 * mid-composition — without the letters still sitting in the IME buffer, and therefore
 * without the sentence making sense. The user's report was "the agent doesn't attach the
 * system prompt any more", because the composed message never went through
 * `composeAndSend`'s marker path at all. Nothing about the symptom pointed at an IME.
 *
 * Two checks, because the standard one is not universally reliable:
 *
 * - `isComposing` is the spec answer and Chrome sets it correctly.
 * - `keyCode === 229` is the legacy signal for "the IME swallowed this key". Some
 *   browser/IME combinations report the key that way *without* setting `isComposing`,
 *   and it costs nothing to honour both.
 */
export function isImeComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
