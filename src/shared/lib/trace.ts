/**
 * Opt-in verbose tracing. Enable per context:
 *
 *   node scripts/devtap.mjs eval dbw 'globalThis.__bsTrace = true'
 *
 * Or from a devtools console on the page: `__bsTrace = true`.
 */
export const isTracing = (): boolean =>
  (globalThis as Record<string, any>).__bsTrace === true;

export const trace = (...args: unknown[]): void => {
  if (isTracing()) console.log(...args);
};
