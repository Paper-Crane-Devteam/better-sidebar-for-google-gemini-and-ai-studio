/**
 * Syntax highlighting for previewed source files and Markdown code fences.
 *
 * ## What this costs, measured rather than assumed
 *
 * `highlight.js`'s default entry point registers ~190 languages and is larger than most of
 * the sidebar, so it is off the table. `lib/core` plus the 28 grammars below measures
 * 144 KB minified / 43 KB gzipped (esbuild, bundled and minified in isolation), against
 * `content-scripts/overlay.js`'s 4.2 MB — about 3.4%. Core alone is 21 KB / 8.5 KB, so
 * nearly all of it is the grammars, and the list is the dial: dropping to the 14 most
 * common halves it. That is the trade to revisit if the bundle ever becomes the problem,
 * and it is why this is a deliberate list rather than a convenience import.
 *
 * ## Why the imports are static, and why that is not a mistake
 *
 * The instinct is `import()`, so the highlighter only downloads when someone opens a source
 * file. It does not work here: WXT bundles content scripts as a single IIFE — the built
 * `overlay.js` starts `var overlay=(function(){` and contains no chunk references — so a
 * dynamic import is inlined by Rollup and buys nothing but a Promise. The existing
 * `await import()` calls in the content script (`fflate`, the platform layouts) defer
 * *execution*, not download, and reading them as lazy loading is a trap worth naming here.
 *
 * What is still deferred is the grammar construction: `ensureRegistered` runs on first
 * highlight, not at module load, so the sidebar's startup does not pay for 28 grammar
 * factories nobody has asked for yet.
 *
 * ## Why an HTML string
 *
 * `hljs.highlight` returns markup, so call sites use `dangerouslySetInnerHTML`. Safe for a
 * concrete reason rather than by assumption: the highlighter escapes `&`, `<` and `>` in the
 * source it is handed and only ever emits `<span class="hljs-…">` around it, so nothing in
 * a previewed file or a model's code fence can become live markup. A token-based renderer
 * (`prism-react-renderer`) would avoid the call, at the price of a second highlighter and a
 * coupling to React in a module that otherwise has none.
 */

import hljsCore from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * The grammars, keyed by the name they register under.
 *
 * A map rather than 28 `registerLanguage` calls so a name cannot drift from the identifier
 * it was imported as. A typo in a hand-written call fails silently — `getLanguage` returns
 * undefined, the block loses its colour, and nothing is logged.
 *
 * Registering a grammar also registers its own aliases, which is what makes Markdown
 * fences work without a second lookup table: `ts`, `py`, `sh`, `yml`, `c++` and friends
 * all resolve after this runs.
 */
const GRAMMARS: Record<string, LanguageFn> = {
  bash, c, cpp, csharp, css, diff, dockerfile, go, graphql, ini, java, javascript,
  json, kotlin, less, lua, makefile, markdown, php, python, ruby, rust, scss, sql,
  swift, typescript, xml, yaml,
};

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  for (const [name, grammar] of Object.entries(GRAMMARS)) {
    hljsCore.registerLanguage(name, grammar);
  }
}

/**
 * Extension → grammar, for files whose language has to be inferred from their name.
 *
 * Deliberately narrower than `TEXT_EXTENSIONS` in `workspace/file-kinds.ts`: an unmapped
 * file still previews, just without colour, so the bar for an entry is "someone keeps
 * files of this kind in a workspace", not "highlight.js supports it".
 *
 * Some mappings are close rather than exact, because a close grammar reads far better than
 * none:
 * - `toml`, `conf`, `env`, `properties` → `ini`. Sections, keys and strings all land; TOML's
 *   arrays and dotted keys go unstyled.
 * - `vue`, `svelte`, `astro` → `xml`. The template highlights, the embedded script does not.
 * - `sass` → `scss`. Indented Sass has no braces, so only the tokens carry over.
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  // web
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', plist: 'xml',
  vue: 'xml', svelte: 'xml', astro: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  // data and config
  json: 'json', jsonl: 'json', ndjson: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
  // languages
  py: 'python', pyi: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  // shell and build
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  dockerfile: 'dockerfile',
  // queries and diffs
  sql: 'sql',
  graphql: 'graphql', gql: 'graphql',
  diff: 'diff', patch: 'diff',
  // `md`/`mdx` are absent on purpose: the reader routes those to `MarkdownRenderer` and
  // never shows them as source. The `markdown` grammar is still registered, for a
  // ```markdown fence inside a rendered document.
};

/**
 * Fence labels that highlight.js does not resolve on its own.
 *
 * Most do resolve — registering a grammar registers its aliases, so `ts`, `py`, `sh`, `yml`,
 * `c++`, `html` and `docker` all work with no table at all. These are the gaps, and each is
 * a label models actually write:
 * - `shell` and `console` are real highlight.js grammars, but ones that only mark the prompt
 *   character; the fence almost always contains shell script, so `bash` is what was meant.
 * - `jsonc` and `json5` have no grammar. `json` highlights everything except the comments
 *   that distinguish them.
 * - `vue`, `svelte` and `astro` as fence labels get the same treatment as the file
 *   extensions: template markup highlights, embedded script does not.
 */
const FENCE_ALIASES: Record<string, string> = {
  shell: 'bash',
  console: 'bash',
  jsonc: 'json',
  json5: 'json',
  toml: 'ini',
  vue: 'xml',
  svelte: 'xml',
  astro: 'xml',
  sass: 'scss',
};

/**
 * Files whose name carries the language, with no extension to read it from.
 *
 * `Dockerfile`, `Makefile`, and the dotfiles — for which `lastIndexOf('.')` finds the
 * leading dot and yields no usable extension.
 */
const LANGUAGE_BY_BASENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  '.gitignore': 'bash',
  '.gitattributes': 'bash',
  '.dockerignore': 'bash',
  '.npmrc': 'ini',
  '.editorconfig': 'ini',
  '.env': 'ini',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
};

/**
 * Which grammar to use for a path, or `null` to leave it as plain text.
 *
 * The name check runs first, and then again on the leading segment: `Dockerfile.dev` and
 * `.env.local` both have an extension that says nothing about their contents.
 */
export function languageOf(path: string): string | null {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

  const byName = LANGUAGE_BY_BASENAME[base];
  if (byName) return byName;

  const firstSegment = base.startsWith('.')
    ? `.${base.slice(1).split('.')[0]}`
    : base.split('.')[0];
  const byPrefix = LANGUAGE_BY_BASENAME[firstSegment];
  if (byPrefix) return byPrefix;

  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1)] ?? null;
}

/**
 * Largest block that gets highlighted, in characters.
 *
 * Highlighting is a synchronous parse with no way to yield partway. The reader renders
 * files up to `PREVIEW_BYTE_LIMIT` (512 KB), and at the top of that range a parse would
 * stall the sidebar for the better part of a second — the exact failure that limit exists
 * to prevent, reintroduced one layer up. Past this threshold the content still renders,
 * just without colour.
 *
 * Characters rather than bytes: that is what the parser walks, and the string is already
 * decoded by the time it arrives.
 */
export const HIGHLIGHT_CHAR_LIMIT = 128 * 1024;

/**
 * The same ceiling for a Markdown code fence, which is much lower, for a reason that has
 * nothing to do with the parse itself.
 *
 * A file is highlighted once. A fence in a streaming reply is highlighted on every token,
 * because its text grows by a few characters at a time and each version is a different
 * string. So the cost is not "one parse of N characters" but "N/chunk parses averaging
 * N/2" — quadratic in the length of the block, on the main thread, while the sidebar is
 * also laying out incoming text.
 *
 * 20 KB is past almost every code block a model emits and short enough that the repeated
 * parse stays under a millisecond or two. A longer one renders plain, which is what the
 * conversation did before this existed.
 */
export const FENCE_CHAR_LIMIT = 20 * 1024;

/**
 * Highlighted HTML for `code`, or `null` if it should be shown as plain text.
 *
 * `language` is a grammar name or any alias highlight.js knows for one, so a Markdown
 * fence's own label (`ts`, `sh`, `yml`, `c++`) can be passed through untranslated.
 *
 * Synchronous on purpose. The alternative — highlight in an effect and swap the result in
 * — sounds gentler but is worse in both places it would be used: a static file would flash
 * plain text before colouring, and a streaming fence would flicker between coloured and
 * plain every time the stream paused for longer than the delay. Rendering from the current
 * text means the output is never briefly wrong. `maxChars` is what keeps that affordable.
 *
 * Returns `null` on anything unexpected instead of throwing. Every caller's fallback is
 * the plain text it already has, so a failure here should cost the colour and nothing
 * else.
 */
export function highlight(
  code: string,
  language: string,
  maxChars: number = HIGHLIGHT_CHAR_LIMIT,
): string | null {
  if (!language || code.length > maxChars) return null;

  const resolved = FENCE_ALIASES[language] ?? language;

  try {
    ensureRegistered();
    if (!hljsCore.getLanguage(resolved)) return null;
    // `ignoreIllegals` — a grammar's `illegal` rules assume a well-formed file, while this
    // renders half-finished edits, generated output, and code fences still being streamed
    // in. Without it a single stray token throws away the whole block's colour.
    return hljsCore.highlight(code, { language: resolved, ignoreIllegals: true }).value;
  } catch (e) {
    console.warn('[syntax-highlight] failed:', (e as Error).message);
    return null;
  }
}
