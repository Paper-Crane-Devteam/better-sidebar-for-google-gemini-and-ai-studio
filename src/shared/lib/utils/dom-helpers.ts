/**
 * DOM helper utilities for working with Shadow DOM and elements
 */

/**
 * Query selector that searches through shadow DOMs recursively
 * @param selector - CSS selector to search for
 * @param root - Root element or document to start searching from
 * @returns Found element or null
 */
export const querySelectorDeep = (
  selector: string,
  root: Document | Element = document
): Element | null => {
  if (!root) return null;
  try {
    const found = root.querySelector(selector);
    if (found) return found;
  } catch (e) {}
  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      try {
        if (el.shadowRoot) {
          const deepFound = querySelectorDeep(
            selector,
            el.shadowRoot as unknown as Element
          );
          if (deepFound) return deepFound;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
};

/**
 * Wait for an element to appear in the DOM (including shadow DOMs)
 * @param selector - CSS selector to wait for
 * @returns Promise that resolves when element is found
 */
export const waitForElement = (selector: string, timeout = 10000): Promise<Element | null> => {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = querySelectorDeep(selector);
      if (el) resolve(el);
      else if (Date.now() - start > timeout) resolve(null);
      else requestAnimationFrame(check);
    };
    check();
  });
};
