/**
 * Telling text from binary, and why the distinction has to exist at all.
 *
 * The tempting answer is that it does not: store whatever the user drops, and let a
 * binary file simply be one the agent cannot read. That would be true if bytes went in
 * untouched — but the workspace's original write path took a JS string, so anything
 * arriving through it was decoded as UTF-8 first, and every invalid sequence in a PNG
 * became U+FFFD. Not unreadable: *destroyed*, and destroyed quietly, so the file
 * downloads later as a corrupt one.
 *
 * `writeBytes` closes that hole — uploads now round-trip exactly, binary included. What
 * remains is a labelling problem rather than a storage one. The agent's `read_file`
 * still deals in text, so a binary file is dead weight to it, and the tree should say so
 * up front instead of letting someone discover it from a garbled tool result.
 *
 * ## Two different questions, two different methods
 *
 * `isProbablyBinary(name)` guesses from the extension. Cheap, wrong at the margins, and
 * that is fine: it only picks an icon. Reading every file in the tree to render a row
 * would be one OPFS round trip per entry.
 *
 * `looksBinary(bytes)` inspects the content. Used once, at upload, where the answer
 * drives what the user is told. A NUL byte in the first few KB is the same heuristic
 * git uses — no text encoding in practice puts one there, and every binary container
 * does within its header.
 */

/** Extensions treated as text, so the agent can work with them. */
const TEXT_EXTENSIONS = new Set([
  // prose and notes
  'txt', 'md', 'markdown', 'mdx', 'rst', 'org', 'adoc', 'tex',
  // data and config
  'json', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'properties', 'csv', 'tsv', 'xml', 'svg', 'plist',
  // web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
  // code
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyi', 'rb', 'go',
  'rs', 'java', 'kt', 'kts', 'scala', 'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp',
  'hh', 'cs', 'php', 'pl', 'pm', 'lua', 'r', 'jl', 'dart', 'ex', 'exs', 'erl',
  'hs', 'clj', 'cljs', 'elm', 'zig', 'nim', 'v', 'sol',
  // shell and build
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'make', 'mk', 'cmake',
  'dockerfile', 'gradle', 'sbt',
  // queries, diffs, logs
  'sql', 'graphql', 'gql', 'prisma', 'proto', 'diff', 'patch', 'log',
  // misc
  'gitignore', 'gitattributes', 'editorconfig', 'lock', 'srt', 'vtt', 'ics',
]);

/** Extensions rendered as Markdown in the reader rather than shown as source. */
export const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx']);

/**
 * Formats the document engine understands (`shared/documents/`).
 *
 * These are still binary as far as `read_file` is concerned — a `.docx` is a zip, and
 * decoding it as text produces noise. What changed is that they are no longer *dead
 * weight*: the agent reads them with `doc_read`, so the tree and the reader must say
 * "this needs a different tool" rather than "this file is unusable".
 *
 * ⚠️ Membership here is a claim that a handler is registered. Adding an extension before
 * its handler exists makes the UI promise something the agent will then refuse.
 */
export const DOCUMENT_EXTENSIONS = new Set([
  'docx',
  'docm',
  'xlsx',
  'xlsm',
  'xltx',
]);

/** Whether the document tools can read this file. */
export function isDocumentFormat(path: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extensionOf(path));
}

/**
 * Largest file the reader will render.
 *
 * Not a storage limit — the file is stored, downloadable, and readable by the agent either
 * way. This is only about the reader, where the cost lands twice: a `<pre>` of half a
 * megabyte is one text node the layout engine has to measure in a single pass, and the
 * Markdown path parses the whole string on the main thread before that. Both stall the
 * sidebar with no way to cancel.
 *
 * 512 KB is far past any note or source file and well short of where the freeze becomes
 * noticeable. Above it the reader shows the file's details instead, which is the honest
 * offer: here is what this is, and here is the download.
 */
export const PREVIEW_BYTE_LIMIT = 512 * 1024;

/**
 * A file's extension, lowercased, without the dot.
 *
 * Returns '' for a name with no extension and for a dotfile like `.gitignore` —
 * `lastIndexOf('.') <= 0` catches both. Dotfiles are then matched by their full name
 * below, since `gitignore` is in the text list.
 */
export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** The file name, without its directories. */
export function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Extensions known to be binary. Only used to override the text-by-default guess. */
const BINARY_EXTENSIONS = new Set([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'avif', 'heic',
  'psd', 'ai', 'eps',
  // audio and video
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma',
  'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv',
  // documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // archives
  'zip', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'tar', 'jar', 'war',
  // binaries and data stores
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'obj', 'class', 'pyc', 'pyo',
  'wasm', 'db', 'sqlite', 'sqlite3', 'mdb', 'dat', 'pack', 'idx',
  // fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // ml and misc
  'safetensors', 'ckpt', 'pt', 'pth', 'onnx', 'npy', 'npz', 'parquet',
]);

/**
 * Whether a name looks like text the agent could read.
 *
 * An unknown extension counts as text. The bias is deliberate: an unrecognised source
 * file shown as text reads fine, whereas a `.md` mislabelled as binary would look
 * unusable. Real binaries are the ones with well-known extensions, so guessing text by
 * default costs little.
 */
export function isProbablyText(path: string): boolean {
  // Dotfiles and extensionless conventions: `.gitignore`, `Dockerfile`, `Makefile`.
  const base = basenameOf(path).toLowerCase();
  const bare = base.startsWith('.') ? base.slice(1) : base;
  if (TEXT_EXTENSIONS.has(bare)) return true;

  // No extension at all — `LICENSE`, `README`, `CHANGELOG` are text, and so is most of
  // what a person would drop in a notes workspace without one.
  const ext = extensionOf(path);
  if (ext === '') return true;

  return TEXT_EXTENSIONS.has(ext) || !BINARY_EXTENSIONS.has(ext);
}

/** Whether a name looks binary. The complement of `isProbablyText`, spelled out. */
export function isProbablyBinary(path: string): boolean {
  return !isProbablyText(path);
}

/** How many leading bytes to inspect. Every real container declares itself by here. */
const SNIFF_BYTES = 8192;

/**
 * Whether the actual content is binary.
 *
 * A NUL byte is the signal. UTF-8, UTF-8-with-BOM, Latin-1 and every legacy code page
 * a text file might use encode no NUL for any printable character, while binary formats
 * put one in their header almost without exception.
 *
 * UTF-16 is the known false positive — its ASCII range is NUL-padded, so it reads as
 * binary here. Left as-is on purpose: a UTF-16 file handed to the agent as text would
 * arrive full of interleaved NULs anyway, so "binary" is the more useful answer than a
 * detection branch that lets it through broken.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

/** Human-readable byte size, for tooltips and row hints. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
