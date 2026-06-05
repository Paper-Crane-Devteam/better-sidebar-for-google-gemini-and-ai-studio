/**
 * Prompt capsule: a <strong> element inserted into the contenteditable
 * input field to visually mark a selected prompt.
 *
 * Format: <strong data-prompt-content="...">/{prompt title}</strong>
 *
 * Using <strong> matches Gemini's own inline formatting behavior (e.g. @mentions),
 * so the browser's contenteditable engine handles it natively — no cursor/deletion bugs.
 * The element is fully editable (user can backspace to delete characters normally).
 *
 * The real prompt content is stored in a data attribute and expanded before sending.
 */

const CAPSULE_TAG = 'STRONG';
const CAPSULE_ATTR_CONTENT = 'data-prompt-content';
const CAPSULE_CLASS = 'bs-prompt-capsule';

export interface CapsuleData {
  title: string;
  content: string;
}

/**
 * Create a <strong> element representing the prompt in the editor.
 */
export function createCapsuleElement(data: CapsuleData): HTMLElement {
  const el = document.createElement('strong');
  el.className = CAPSULE_CLASS;
  el.setAttribute(CAPSULE_ATTR_CONTENT, data.content);
  el.textContent = `/${data.title}`;
  return el;
}

/**
 * Check if an editor contains any prompt capsules.
 */
export function hasCapsules(editor: HTMLElement): boolean {
  return editor.querySelector(`.${CAPSULE_CLASS}`) !== null;
}

/**
 * Replace all capsules in the editor with their stored prompt content (as plain text).
 * Called just before message submission so Gemini sends the actual prompt text.
 */
export function expandCapsules(editor: HTMLElement): void {
  const capsules = editor.querySelectorAll(`.${CAPSULE_CLASS}`);
  capsules.forEach((capsule) => {
    const content = capsule.getAttribute(CAPSULE_ATTR_CONTENT) || '';
    const textNode = document.createTextNode(content);
    capsule.parentNode?.replaceChild(textNode, capsule);
  });

  // Trigger input event so Quill/Gemini picks up the change
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Given the editor element, extract all text content with capsules
 * replaced by their stored prompt content.
 */
export function extractEditorContent(editor: HTMLElement): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.classList.contains(CAPSULE_CLASS)) {
        const content = el.getAttribute(CAPSULE_ATTR_CONTENT) || '';
        parts.push(content);
        return;
      }

      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        parts.push('\n');
        return;
      }

      for (const child of el.childNodes) {
        walk(child);
      }

      if ((tag === 'p' || tag === 'div') && el.nextSibling) {
        parts.push('\n');
      }
    }
  };

  for (const child of editor.childNodes) {
    walk(child);
  }

  return parts.join('');
}

export { CAPSULE_CLASS, CAPSULE_ATTR_CONTENT };
