import React, { memo, useMemo, Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import { cn } from '@/shared/lib/utils/utils';
import {
  buildSearchRegex,
  splitByMatches,
  type SearchMatchOptions,
} from '@/shared/lib/search-pattern';
// Aliased: this file's own `highlight` is the search term to mark, which is a different
// job and, below, a competing one.
import {
  FENCE_CHAR_LIMIT,
  highlight as highlightCode,
} from '@/shared/lib/syntax-highlight';

// Error boundary to prevent math rendering errors from breaking the entire component
class MarkdownErrorBoundary extends Component<
  { children: React.ReactNode; fallback: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[MarkdownRenderer] Render error:', error.message);
  }
  render() {
    if (this.state.hasError) {
      return <pre className="text-xs whitespace-pre-wrap">{this.props.fallback}</pre>;
    }
    return this.props.children;
  }
}

/** Render a KaTeX formula safely — returns HTML string or fallback on error */
function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      output: 'html',
    });
  } catch {
    return `<code>${tex}</code>`;
  }
}

/**
 * A fenced code block with a language label, coloured.
 *
 * Its own component, and memoised, for one reason: this renderer runs on every token of a
 * streaming reply, and `ReactMarkdown` rebuilds the whole element tree each time. Doing the
 * parse inline in the `code` override would re-highlight every finished block in the message
 * on every token — quadratic in the length of the reply. Here, blocks whose text has
 * stopped changing get identical props, `memo` skips them, and only the block currently
 * being written is parsed again.
 *
 * Falls back to plain text whenever `highlightCode` declines (unknown language, past
 * `FENCE_CHAR_LIMIT`, grammar failure), which is what every code block looked like before.
 */
const HighlightedFence = memo(
  ({
    code,
    language,
    className,
  }: {
    code: string;
    language: string;
    className?: string;
  }) => {
    const html = useMemo(
      () => highlightCode(code, language, FENCE_CHAR_LIMIT),
      [code, language],
    );

    const classes = cn(
      'bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground block p-4',
      html != null && 'hljs',
      className,
    );

    // `highlightCode` escapes the block's own text and emits nothing but
    // `<span class="hljs-…">` around it, so no code a model writes can become live markup.
    return html == null ? (
      <code className={classes}>{code}</code>
    ) : (
      <code className={classes} dangerouslySetInnerHTML={{ __html: html }} />
    );
  },
);

HighlightedFence.displayName = 'HighlightedFence';

/** The slice of hast this file touches; avoids a direct dependency on `@types/hast`. */
interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

type Range = [start: number, end: number];

const SEARCH_MARK_CLASSES = ['bg-highlight/65', 'text-foreground', 'rounded-[2px]'];

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function isMathNode(node: HastNode): boolean {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? [cls] : [];
  return list.some((c) => c.includes('katex') || c.includes('math-inline') || c.includes('math-display'));
}

function sourceRange(node: HastNode): Range | null {
  const s = node.position?.start.offset;
  const e = node.position?.end.offset;
  return s == null || e == null ? null : [s, e];
}

/** Match ranges, as offsets into `text`. */
function matchRanges(text: string, regex: RegExp): Range[] {
  const out: Range[] = [];
  let at = 0;
  for (const part of splitByMatches(text, regex)) {
    if (part.isMatch) out.push([at, at + part.text.length]);
    at += part.text.length;
  }
  return out;
}

/**
 * Marks search hits in the rendered markdown.
 *
 * ⚠️ The query is matched against the **markdown source**, not the rendered text, because
 * that is what the DB search matched. Matching each rendered text node on its own (what
 * this used to do) misses two kinds of hit the search happily returns:
 * - a query that includes markup, e.g. `**行为**` — the rendered text has no asterisks;
 * - a regex that spans formatting, e.g. `行为.+google` over `**行为** … \`google:search\``
 *   — the hit is split across a <strong>, a plain text node and a <code>.
 *
 * So hits are found once in the source, and each text node marks whatever part of them it
 * covers, located through its source position. A text node whose value is not a verbatim
 * slice of its source span (inline code includes its backticks, a fenced block's text has
 * no position of its own) is found inside the span with `indexOf`; if even that fails
 * (escapes, entities, stripped list indentation) it falls back to matching its own text.
 */
function rehypeSearchMarks({ source, regex }: { source: string; regex: RegExp | null }) {
  return (tree: HastNode) => {
    if (!regex) return;
    const hits = matchRanges(source, regex);
    if (hits.length === 0) return;

    const localRanges = (value: string, window: Range | null): Range[] => {
      if (window) {
        const slice = source.slice(window[0], window[1]);
        const idx = slice === value ? 0 : slice.indexOf(value);
        if (idx >= 0) {
          const base = window[0] + idx;
          const end = base + value.length;
          return hits
            .filter(([a, b]) => b > base && a < end)
            .map(([a, b]): Range => [Math.max(a, base) - base, Math.min(b, end) - base]);
        }
      }
      return matchRanges(value, regex);
    };

    const walk = (node: HastNode, window: Range | null) => {
      if (!node.children || isMathNode(node)) return;
      const own = sourceRange(node) ?? window;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type !== 'text' || !child.value) {
          walk(child, own);
          next.push(child);
          continue;
        }
        const value = child.value;
        const ranges = localRanges(value, sourceRange(child) ?? own);
        if (ranges.length === 0) {
          next.push(child);
          continue;
        }
        let last = 0;
        for (const [a, b] of ranges) {
          if (a > last) next.push({ type: 'text', value: value.slice(last, a) });
          next.push({
            type: 'element',
            tagName: 'span',
            properties: { className: SEARCH_MARK_CLASSES },
            children: [{ type: 'text', value: value.slice(a, b) }],
          });
          last = b;
        }
        if (last < value.length) next.push({ type: 'text', value: value.slice(last) });
      }
      node.children = next;
    };

    walk(tree, sourceRange(tree));
  };
}

interface MarkdownRendererProps {
  children: string;
  className?: string;
  highlight?: string;
  highlightOptions?: SearchMatchOptions;
}

export const MarkdownRenderer = memo(({ children, className, highlight, highlightOptions }: MarkdownRendererProps) => {
  const searchRegex = useMemo(
    () => (highlight && highlight.trim() ? buildSearchRegex(highlight, highlightOptions ?? {}, 'g') : null),
    [highlight, highlightOptions],
  );

  // Search marks are inserted into the hast tree (see `rehypeSearchMarks`), so by the time
  // the overrides below run, children already contain them and are rendered as-is.
  // We need to override components that can contain text.
  const components: any = {
      // Math components — in react-markdown v10, remark-math outputs code elements with language-math class
      code: ({ node, className, children, ...props }: any) => {
        // From the hast node, not `String(children)`: with search marks inserted, children
        // are an array of elements and would stringify to `[object Object]`.
        const content = (node ? textOf(node) : String(children)).replace(/\n$/, '');
        
        // Inline math: $...$
        if (className === 'language-math math-inline') {
          const html = renderKatex(content, false);
          return <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
        }
        // Display math: $$...$$
        if (className === 'language-math math-display') {
          const html = renderKatex(content, true);
          return <span className="math-display block my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
        }
        
        // `+`, `#` and `-` are in the class because `c++`, `f#` and `objective-c` are real
        // fence labels; `\w+` alone would read them as `c` and `f`, which highlight as the
        // wrong language rather than as none.
        const match = /language-([\w+#-]+)/.exec(className || '');
        const isInline = !match && !content.includes('\n');

        /*
          Search marking wins over syntax colouring when both apply.

          `rehypeSearchMarks` wraps matches in <span>s in the tree; the highlighter
          returns an HTML string. There is no way to do both without re-implementing one of
          them, and the choice is not close: someone reading with a search term active is
          looking for the term, and a coloured block that hides their hits is worse than an
          uncoloured one that shows them.
        */
        // `match[1] !== 'math'` belts the braces on the two exact-className checks above:
        // if remark-math ever emits its classes in the other order, those miss, and this
        // would otherwise try to highlight a formula as a language called `math`.
        if (match && match[1] !== 'math' && !highlight) {
          return (
            <HighlightedFence
              code={content}
              language={match[1].toLowerCase()}
              className={className}
            />
          );
        }

        return (
          <code 
            className={cn(
              "bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground",
              !isInline && "block p-4",
              className
            )} 
            {...props}
          >
             {children}
          </code>
        );
      },
      a: ({ node, children, ...props }: any) => (
        <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
             {children}
        </a>
      ),
      pre: ({ children }: any) => (
        <pre className="bg-muted p-0 rounded-md overflow-x-auto my-3 border border-border/50 max-w-full">
          {children}
        </pre>
      ),
      p: ({ children }: any) => <p className="leading-relaxed [&:not(:first-child)]:mt-3.5">{children}</p>,
      li: ({ children }: any) => <li>{children}</li>,
      // Nested lists get a tighter vertical rhythm and a different bullet shape,
      // so a sub-level reads as belonging to its parent rather than as a new block.
      ul: ({ children }: any) => (
        <ul className="my-3 ml-5 list-disc [&>li]:mt-1.5 [&_ul]:!my-1 [&_ol]:!my-1 [&_ul]:list-[circle] [&_ul_ul]:list-[square]">
          {children}
        </ul>
      ),
      ol: ({ children }: any) => (
        <ol className="my-3 ml-5 list-decimal [&>li]:mt-1.5 [&_ul]:!my-1 [&_ol]:!my-1">
          {children}
        </ol>
      ),
      h1: ({ children }: any) => <h1 className="text-xl font-semibold tracking-tight mt-5 mb-2.5 first:mt-0">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-lg font-semibold tracking-tight mt-4 mb-2 first:mt-0">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-base font-semibold tracking-tight mt-3.5 mb-1.5 first:mt-0">{children}</h3>,
      h4: ({ children }: any) => <h4 className="text-sm font-semibold tracking-tight mt-3 mb-1.5 first:mt-0">{children}</h4>,
      h5: ({ children }: any) => <h5 className="text-sm font-medium tracking-tight mt-2.5 mb-1 first:mt-0">{children}</h5>,
      h6: ({ children }: any) => <h6 className="text-xs font-medium tracking-tight text-muted-foreground mt-2 mb-1 first:mt-0">{children}</h6>,
      strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }: any) => <em className="italic">{children}</em>,
      blockquote: ({ children }: any) => (
          <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2">
              {children}
          </blockquote>
      ),
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-4">
          <table className="min-w-full border-collapse border border-border">
            {children}
          </table>
        </div>
      ),
      th: ({ children }: any) => (
        <th className="border border-border bg-muted p-2 text-left font-medium">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="border border-border p-2">
          {children}
        </td>
      ),
      img: ({ node, ...props }: any) => (
        <img
          {...props}
          className="rounded-md border border-border/50 shadow-sm w-full h-auto object-contain my-4"
          loading="lazy"
        />
      ),
  };

  return (
    <MarkdownErrorBoundary fallback={children}>
      <div className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        "[--tw-prose-body:currentColor]",
        "[--tw-prose-headings:currentColor]",
        "[--tw-prose-bold:currentColor]",
        "[--tw-prose-links:rgb(var(--primary))]",
        "[--tw-prose-code:currentColor]",
        // typography 插件默认给行内 code 前后加反引号，我们已有背景样式，去掉
        "prose-code:before:content-none prose-code:after:content-none",
        className,
      )}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeSearchMarks, { source: children, regex: searchRegex }]]}
          components={components}
        >
          {children}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
