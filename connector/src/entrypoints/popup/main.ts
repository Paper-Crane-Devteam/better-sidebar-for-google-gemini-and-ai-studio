/** The Connector's only UI: what is attached, a way to cut it off, and whether Better Sidebar is there. */

import { MAIN_STORE_URL } from '../../../../src/shared/web-agent/connector-protocol';
import type { PopupRequest, PopupState } from './messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const list = $<HTMLUListElement>('tabs');
const empty = $<HTMLParagraphElement>('empty');
const disconnect = $<HTMLButtonElement>('disconnect');
const paused = $<HTMLInputElement>('paused');

async function ask(req: PopupRequest): Promise<PopupState | null> {
  return chrome.runtime.sendMessage(req);
}

function render(state: PopupState | null) {
  status.replaceChildren();
  status.className = 'status';
  if (!state) {
    status.textContent = 'Could not read the Connector state.';
    status.classList.add('warn');
    return;
  }

  if (!state.mainInstalled) {
    status.classList.add('warn');
    status.append('Better Sidebar was not found. ');
    const link = document.createElement('a');
    link.href = MAIN_STORE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Get it from the Chrome Web Store';
    status.append(link);
  } else if (state.paused) {
    status.classList.add('warn');
    status.textContent = 'Paused. The Web Agent cannot operate any page.';
  } else {
    status.classList.add('ok');
    status.textContent = 'Connected to Better Sidebar.';
  }

  list.replaceChildren(...state.tabs.map(tab => {
    const li = document.createElement('li');
    if (tab.faviconUrl) {
      const icon = document.createElement('img');
      icon.src = tab.faviconUrl;
      icon.alt = '';
      li.append(icon);
    }
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title || tab.url;
    title.title = tab.url;
    li.append(title);
    return li;
  }));
  empty.hidden = state.tabs.length > 0;
  disconnect.disabled = state.tabs.length === 0;
  paused.checked = state.paused;
}

disconnect.addEventListener('click', () => void ask({ op: 'disconnect-all' }).then(render));
paused.addEventListener('change', () => void ask({ op: 'set-paused', paused: paused.checked }).then(render));

void ask({ op: 'state' }).then(render);
