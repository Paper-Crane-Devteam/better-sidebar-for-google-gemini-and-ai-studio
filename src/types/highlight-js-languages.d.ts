/**
 * highlight.js ships types for its core (`es/core.d.ts`) but not for the individual
 * grammars, so `import typescript from 'highlight.js/lib/languages/typescript'` has no
 * declaration to resolve to and trips `noImplicitAny`.
 *
 * A grammar module's only shape that matters to us is its default export, which we hand
 * straight to `registerLanguage`. `LanguageFn` is the type that function already expects,
 * so declaring it here gives the registration call a real check rather than papering over
 * it with `any`.
 */
declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js';

  const language: LanguageFn;
  export default language;
}
