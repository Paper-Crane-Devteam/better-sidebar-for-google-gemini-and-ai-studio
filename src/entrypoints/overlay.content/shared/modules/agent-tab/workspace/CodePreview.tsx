/**
 * Source text in the file reader, coloured when the file name names a language we know.
 *
 * Everything that can go wrong ends at plain monospace text: an unmapped extension, a file
 * past the highlighter's size ceiling, a grammar that throws. That is the same output the
 * reader gave for every non-Markdown file before highlighting existed, so the worst failure
 * mode here is "no colour".
 */

import React, { useMemo } from 'react';
import { highlight, languageOf } from '@/shared/lib/syntax-highlight';

interface CodePreviewProps {
  /** File body, already decoded. */
  code: string;
  /** Workspace path — the only thing that says what language this is. */
  path: string;
}

export const CodePreview: React.FC<CodePreviewProps> = ({ code, path }) => {
  /*
    Keyed on `code` as well as `path`, because the drawer re-reads on every workspace
    revision so the agent's edits appear live. Cheap in practice: an edit is the only thing
    that changes the string, and the reader's own `PREVIEW_BYTE_LIMIT` bounds its length.
  */
  const html = useMemo(() => {
    const language = languageOf(path);
    return language ? highlight(code, language) : null;
  }, [code, path]);

  return (
    /*
      13px rather than `text-xs`. The reader is a full-height pane you actually read in, not a
      detail popover, and 12px monospace in it asks for leaning in. `leading-[1.6]` comes with
      it: code at a comfortable size but default line height reads as a wall.
    */
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.6] text-foreground">
      {html == null ? (
        code
      ) : (
        /*
          `highlight` escapes the file's own text and emits nothing but
          `<span class="hljs-…">` around it, so no content of a previewed file can turn into
          markup here. See that module's header for the full argument.
        */
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </pre>
  );
};
