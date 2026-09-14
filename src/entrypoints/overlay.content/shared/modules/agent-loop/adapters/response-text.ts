/**
 * Reading the model's *literal* output back off a rendered response.
 *
 * Both platforms run the model's text through a markdown renderer before we ever see
 * it, and a renderer consumes its own syntax: `*{a,b}*` arrives in the DOM as
 * `<i>{a,b}</i>`, with the asterisks gone from the text entirely. `textContent` and
 * `innerText` therefore do not return what the model wrote — they return what is left
 * after markdown has eaten part of it.
 *
 * That is invisible in prose and fatal in a tool call. The failure that led here:
 *
 *     {"name":"glob_files","params":{"pattern":"*{架构,设计,template}*"}}
 *
 * parsed as valid JSON, ran, and answered `No files match "{架构,设计,template}"` —
 * a pattern with no wildcards left, against a workspace that did contain the file.
 * Nothing errored, and the sidebar showed the *correct* pattern back to the user,
 * because the conversation renderer converts the DOM to markdown (restoring the `*`)
 * while the agent loop read `innerText` (which does not). Same for a `grep_files`
 * regex like `.*`, an `edit_file` `old_string` containing `_`, and any SQL with two
 * `*` on one line.
 *
 * So the delimiters are put back before the text is parsed. `*` vs `_` is not
 * recoverable from `<i>` alone — the asterisk is chosen because it is the form that
 * carries meaning inside a glob, a regex and a SQL projection, and it matches what
 * `htmlToMarkdown` already shows in the sidebar.
 *
 * Fences are not restored: `<pre>` content comes back verbatim without its ``` markers.
 * That no longer matters either way — the parser stopped treating a fenced block as
 * documentation, precisely because the protocol now requires the fence (see
 * `parser/index.ts`). Left as is because nothing needs the markers: this is the degraded
 * path, and it feeds a parser that does not look at them.
 */

/** Tags the renderer produces from paired inline markers, and the marker to restore. */
const INLINE_MARKERS: Record<string, string> = {
  EM: '*',
  I: '*',
  STRONG: '**',
  B: '**',
  DEL: '~~',
  S: '~~',
  STRIKE: '~~',
};

/** Tags that occupy their own line, so the text needs a break around them. */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/** Subtrees that are never part of the model's answer. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

/** Screen-reader-only text: present in `textContent`, never in what the model wrote. */
const SKIP_CLASS = 'cdk-visually-hidden';

/**
 * Extract a response element's text with markdown's inline markers put back.
 *
 * Works on a detached clone as happily as on a live node — nothing here needs layout,
 * which is what makes it usable in the settle loop where `innerText` is not.
 */
export function extractLiteralResponseText(root: HTMLElement): string {
  const out: string[] = [];
  visit(root, out);
  // Renderers nest blocks several deep, so consecutive breaks pile up; two is the most
  // that can carry meaning (a paragraph split) and the model's own blank lines survive.
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function visit(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent ?? '');
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (SKIP_TAGS.has(tag) || el.classList.contains(SKIP_CLASS)) return;

  if (tag === 'BR') {
    out.push('\n');
    return;
  }

  // Verbatim, and without recursing: the highlighter's `<span>`s would otherwise have
  // their contents read as emphasis, and indentation is part of the code.
  if (tag === 'PRE') {
    breakLine(out);
    out.push(el.textContent ?? '');
    breakLine(out);
    return;
  }

  if (tag === 'CODE') {
    const code = el.textContent ?? '';
    // A longer fence than anything inside it, so a backtick in the code survives.
    const fence = code.includes('`') ? '``' : '`';
    out.push(code.trim() ? `${fence}${code}${fence}` : code);
    return;
  }

  const children = Array.from(childNodesOf(el));
  const marker = INLINE_MARKERS[tag];

  if (marker) {
    const inner: string[] = [];
    for (const child of children) visit(child, inner);
    const body = inner.join('');
    // An empty tag is a rendering artefact, not emphasis — adding markers around
    // nothing would inject characters the model never wrote.
    out.push(body.trim() ? `${marker}${body}${marker}` : body);
    return;
  }

  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock) breakLine(out);
  for (const child of children) visit(child, out);
  if (isBlock) breakLine(out);
}

function childNodesOf(el: HTMLElement): NodeListOf<ChildNode> {
  try {
    if (el.shadowRoot) return el.shadowRoot.childNodes;
  } catch {
    // Cross-origin / Xray wrapper — fall through to the light DOM.
  }
  return el.childNodes;
}

/** Append a newline unless the output already ends in one. */
function breakLine(out: string[]): void {
  if (out.length === 0) return;
  if (out[out.length - 1].endsWith('\n')) return;
  out.push('\n');
}
