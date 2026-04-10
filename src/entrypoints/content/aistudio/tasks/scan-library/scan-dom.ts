/**
 * DOM Scanner for Manual Library Scan
 * 
 * This module performs a full DOM scan by scrolling through the library table
 * and extracting conversation metadata. It's used only during manual scans.
 * 
 * For automatic syncing of conversations as they load naturally, see sync-library.ts
 */

// Helper to wait for an element to appear in the DOM
function waitForElement<T extends Element = Element>(selector: string, timeout = 10000): Promise<T | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el as T);

    const observer = new MutationObserver((_mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element as T);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Helper to wait for an element to disappear from the DOM
function waitForElementToDisappear(selector: string, timeout = 10000): Promise<void> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (!el) return resolve();

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

// Helper to wait for DOM changes (scroll loading)
function waitForContentChange(targetNode: Node, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let hasChanged = false;
    const observer = new MutationObserver(() => {
      hasChanged = true;
      observer.disconnect();
      resolve(true);
    });

    observer.observe(targetNode, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(hasChanged);
    }, timeout);
  });
}

export async function scanLibraryDom() {
  console.log('Starting library DOM scan...');

  // 1. Wait for the library table/wrapper
  console.log('Waiting for library table...');
  const scrollContainer = await waitForElement<HTMLElement>(
    '.lib-table-wrapper',
    5000
  );

  if (!scrollContainer) {
    console.error('Could not find .lib-table-wrapper after waiting.');
    return [];
  }

  // Also try to wait for the table element specifically if the user identified it
  await waitForElement('.library-table, table', 5000);

  // Wait for loading spinner to disappear
  await waitForElementToDisappear('mat-spinner', 10000);
  const scannedIds = new Set<string>();
  const items: any[] = [];

  // 2. Scan Loop
  let consecutiveNoLoad = 0;

  while (true) {
    // A. Extract current visible items
    const rows = document.querySelectorAll('tr[mat-row]');
    for (const row of Array.from(rows)) {
      try {
        const nameLink = row.querySelector(
          'td.cdk-column-name a.name-btn'
        ) as HTMLAnchorElement;
        if (!nameLink) continue;

        const href = nameLink.getAttribute('href');
        if (!href) continue;

        const id = href.split('/').pop()?.split('?')[0];
        if (!id || scannedIds.has(id)) continue;

        const title = nameLink.textContent?.trim() || 'Untitled';

        scannedIds.add(id);
        items.push({
          id,
          title,
          external_id: id,
          external_url: href.startsWith('http')
            ? href
            : `https://aistudio.google.com${href}`,
          last_active_at: Math.floor(Date.now() / 1000),
        });
      } catch (e) {
        console.warn('Error parsing row', e);
      }
    }

    // B. Check scroll position
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const currentScrollBottom = scrollTop + clientHeight;

    // If we are close to the bottom
    if (Math.abs(scrollHeight - currentScrollBottom) < 20) {
      if (consecutiveNoLoad > 2) {
        console.log('Scan complete: End of list reached.');
        break;
      }
    }

    // C. Scroll Down
    scrollContainer.scrollTop = scrollHeight;

    // D. Wait for content to load
    // We observe the container (or the table body inside it) for changes
    const tableBody = scrollContainer.querySelector('tbody') || scrollContainer;
    const changed = await waitForContentChange(tableBody, 2000);

    if (changed) {
      consecutiveNoLoad = 0;
      // Give a tiny buffer for rendering
      await new Promise((r) => setTimeout(r, 200));
    } else {
      consecutiveNoLoad++;
    }
  }

  console.log(`DOM Scan finished. Found ${items.length} items.`);
  return items;
}
