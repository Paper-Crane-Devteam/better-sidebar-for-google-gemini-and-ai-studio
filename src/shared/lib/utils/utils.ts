import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip markdown syntax to produce plain text (e.g. for copy-as-text). */
export function stripMarkdown(md: string): string {
  let s = md;
  // Fenced code blocks (preserve inner newlines, drop fences)
  s = s.replace(/```[\w]*\n([\s\S]*?)```/g, (_, inner) => inner);
  // Inline code
  s = s.replace(/`([^`]+)`/g, '$1');
  // Bold/strong: ** or __
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
  // Italic: * or _ (single, not double)
  s = s
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');
  // Strikethrough
  s = s.replace(/~~([^~]+)~~/g, '$1');
  // Links: [text](url) -> text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Images: ![alt](url) -> alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // ATX headers: # ## ### ...
  s = s.replace(/^#{1,6}\s+/gm, '');
  // Setext header underline (=== or ---)
  s = s.replace(/^[=-]{2,}\s*$/gm, '');
  // Blockquote
  s = s.replace(/^>\s?/gm, '');
  // List markers: - * + or 1.
  s = s.replace(/^[\s]*[-*+]\s+/gm, '').replace(/^[\s]*\d+\.\s+/gm, '');
  // Horizontal rule (--- *** ___)
  s = s.replace(/^[-*_]{3,}\s*$/gm, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Helper to safely apply styles to shadow root (compatible with Firefox Xray wrappers)
export function applyShadowStyles(shadow: ShadowRoot, css: string) {
  try {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(css);
    shadow.adoptedStyleSheets = [styleSheet];
  } catch (e) {
    console.warn(
      'Better Sidebar: Failed to use adoptedStyleSheets, falling back to <style>',
      e,
    );
    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);
  }
}

function parseNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Attempt to preserve whitespace for elements like <pre>
    if (
      node.parentElement?.tagName.toUpperCase() === 'CODE' ||
      node.parentElement?.tagName.toUpperCase() === 'PRE'
    ) {
      return node.textContent || '';
    }
    return node.textContent?.trim() || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toUpperCase();

  let children: Node[] = Array.from(element.childNodes);
  // Support Shadow DOM if present
  try {
    if (element.shadowRoot) {
      children = Array.from(element.shadowRoot.childNodes);
    }
  } catch (e) {
    // Ignore Xray wrapper access errors
  }

  let childrenMarkdown = children.map(parseNodeToMarkdown).join('');

  switch (tagName) {
    case 'P':
      return `\n${childrenMarkdown}\n`;
    case 'STRONG':
      return `**${childrenMarkdown}**`;
    case 'H3':
      return `### ${childrenMarkdown}\n\n`;
    case 'UL': {
      const listItems = Array.from(element.children).filter(
        (child) => child.tagName.toUpperCase() === 'LI',
      );
      return (
        '\n' +
        listItems
          .map((item) => `- ${parseNodeToMarkdown(item).trim()}`)
          .join('\n') +
        '\n'
      );
    }
    case 'OL': {
      const listItems = Array.from(element.children).filter(
        (child) => child.tagName.toUpperCase() === 'LI',
      );
      return (
        '\n' +
        listItems
          .map(
            (item, index) =>
              `${index + 1}. ${parseNodeToMarkdown(item).trim()}`,
          )
          .join('\n') +
        '\n'
      );
    }
    case 'LI':
      return childrenMarkdown;
    case 'SPAN':
      if (element.classList.contains('inline-code')) {
        return `\`${childrenMarkdown}\``;
      }
      return childrenMarkdown;
    case 'MS-CODE-BLOCK': {
      const langElement = element.querySelector(
        'mat-panel-title span.ng-star-inserted',
      );
      const lang = langElement
        ? langElement.textContent?.trim().toLowerCase()
        : '';
      const codeElement = element.querySelector('pre code');
      // Use textContent to get the raw code text
      const code = codeElement ? codeElement.textContent : '';
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }
    case 'PRE':
    case 'CODE':
      return childrenMarkdown;
    // These are container tags, just process their children.
    case 'MS-PROMPT-CHUNK':
    case 'MS-TEXT-CHUNK':
    case 'MS-CMARK-NODE':
    case 'DIV':
      return childrenMarkdown;

    default:
      return childrenMarkdown;
  }
}

export function htmlToMarkdown(container: HTMLElement): string {
  // Pre-process: Remove all HTML comments from the innerHTML before parsing
  // This avoids comments messing up the structure or being counted as empty nodes
  const cleanHtml = container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = cleanHtml;

  // First, try to find the specific content node (common in Model responses)
  const cmarkNode = tempContainer.querySelector('ms-cmark-node');
  if (cmarkNode) {
    // We clean up excessive newlines that might be generated
    return parseNodeToMarkdown(cmarkNode)
      .trim()
      .replace(/\n{3,}/g, '\n\n');
  }

  // Fallback: Parse the entire container if no specific wrapper is found (e.g. User messages)
  return parseNodeToMarkdown(tempContainer)
    .trim()
    .replace(/\n{3,}/g, '\n\n');
}

export async function syncGeminiTheme(theme: 'light' | 'dark' | 'system') {
  if (typeof document === 'undefined') return;

  try {
    if (theme === 'system') {
      localStorage.removeItem('Bard-Color-Theme');

      const isSystemDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      if (isSystemDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        document.body.style.colorScheme = 'dark';
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        document.body.style.colorScheme = 'light';
      }

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'Bard-Color-Theme',
          newValue: null,
          storageArea: localStorage,
        }),
      );
    } else {
      const themeValue =
        theme === 'dark' ? 'Bard-Dark-Theme' : 'Bard-Light-Theme';
      localStorage.setItem('Bard-Color-Theme', themeValue);

      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }

      document.body.style.colorScheme = theme;

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'Bard-Color-Theme',
          newValue: themeValue,
          storageArea: localStorage,
        }),
      );
    }
  } catch (error) {
    console.error('Better Sidebar: syncGeminiTheme error:', error);
  }
}

export function syncAiStudioTheme(theme: 'light' | 'dark' | 'system') {
  try {
    if (typeof localStorage !== 'undefined') {
      const key = 'aiStudioUserPreference';
      const stored = localStorage.getItem(key);
      if (stored) {
        const prefs = JSON.parse(stored);
        prefs.theme = theme;
        localStorage.setItem(key, JSON.stringify(prefs));
      }
    }

    // Also sync DOM classes for immediate effect
    if (typeof document !== 'undefined') {
      let isDark = false;
      if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = theme === 'dark';
      }

      if (isDark) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }
      document.body.style.colorScheme = isDark ? 'dark' : 'light';
    }
  } catch (e) {
    // ignore
  }
}

export function syncChatGPTTheme(theme: 'light' | 'dark' | 'system') {
  if (typeof document === 'undefined') return;
  const settingsButton = document.querySelector(
    'button[aria-label="Settings & help"]',
  ) as HTMLElement;
  if (!settingsButton) return;

  settingsButton.click();
}
