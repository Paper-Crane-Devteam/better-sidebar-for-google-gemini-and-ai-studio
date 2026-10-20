/**
 * The Web Agent risk notice, and the place the Web Agent Connector gets set up.
 *
 * Chrome will not let `debugger` be an optional permission, so production builds drive
 * pages through a separate extension that holds it (`shared/web-agent/connector-protocol.ts`).
 * There is nothing to request here: the Connector is either installed and on, or this page
 * says how to get it. Agreeing without a working Connector, or having one without having
 * read this, are both states the agent refuses to run in (`webAgentBlocker`).
 *
 * Dev builds carry `debugger` themselves (`builtin`) and never show the Connector box.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Plug } from 'lucide-react';
import { WEB_CONNECTOR_SEEN_KEY, type WebAgentStatus } from '@/shared/web-agent/contracts';
import { CONNECTOR_STORE_URL } from '@/shared/web-agent/connector-protocol';
import { applyCachedExtensionPageTheme, syncExtensionPageTheme, watchExtensionPageTheme } from '@/shared/lib/extension-page-theme';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import '@/locale/i18n';
import '@/index.scss';

applyCachedExtensionPageTheme();
void syncExtensionPageTheme();
watchExtensionPageTheme();

async function request(action: 'status' | 'accept-consent' | 'withdraw-consent') {
  const result = await browser.runtime.sendMessage({ type: 'WEB_AGENT', payload: { action } });
  if (!result?.success) throw new Error(result?.error);
  return result.data as WebAgentStatus;
}

/** Keys under `agent.web.consent.risks`, in the order they are shown. */
const RISKS = [
  { key: 'actsAsYou', title: 'It acts as you', body: 'The agent works in your own browser, with your logged-in accounts. Whatever it does — submitting a form, sending a message, placing an order — is done under your name, and may not be reversible.' },
  { key: 'dataToAi', title: 'Page content goes to the AI', body: 'Everything the agent reads from a page (text, links, form values) becomes part of your Gemini conversation and is sent to Google. Password fields are never read.' },
  { key: 'injection', title: 'Web pages can try to trick it', body: 'A page can contain hidden instructions written for an AI ("prompt injection"). Check every action before you approve it, especially on sites you do not know.' },
  { key: 'sensitive', title: 'Keep it away from sensitive pages', body: 'Do not use it on banking, payment, medical or account-security pages, or anywhere a mistake would be expensive.' },
  { key: 'mistakes', title: 'The AI makes mistakes', body: 'It can click the wrong thing or misread a page. You approve every click, every piece of typing and every script. Stay at the computer while it runs.' },
  { key: 'stop', title: 'How to stop it', body: 'Chrome shows a "started debugging this browser" bar on every page the agent controls. Press Cancel on that bar, or close the side panel, and it stops immediately.' },
  { key: 'responsibility', title: 'You are responsible for what you approve', body: 'Including following the terms of the websites you use it on. Better Sidebar is provided as is, and is not liable for losses caused by actions you approved.' },
] as const;

/** Why the Connector is not usable, and the way to fix it. Only for the not-ready states. */
function ConnectorBox({ state }: { state: WebAgentStatus['debugger'] }) {
  const { t } = useI18n();
  const body = state === 'paused'
    ? t('agent.web.consent.connector.paused', { defaultValue: 'The Web Agent Connector is paused. Click its icon in the Chrome toolbar and turn it back on.' })
    : state === 'outdated'
      ? t('agent.web.consent.connector.outdated', { defaultValue: 'Your Web Agent Connector is out of date. Update it from the Chrome Web Store, then come back here.' })
      : t('agent.web.consent.connector.missing', { defaultValue: 'To operate pages, the Web Agent needs a small companion extension: Better Sidebar Web Agent Connector. It holds Chrome\'s page debugger permission, so Better Sidebar itself does not have to, and it only accepts requests from Better Sidebar.' });
  return <div className="mt-3 rounded-md border border-border px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-sm font-medium">
      <Plug className="h-3.5 w-3.5 shrink-0" />
      {t('agent.web.consent.connector.title', { defaultValue: 'Web Agent Connector' })}
    </div>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    {state !== 'paused' && <>
      <Button size="sm" className="mt-2 w-full" onClick={() => window.open(CONNECTOR_STORE_URL, '_blank', 'noopener')}>
        {state === 'outdated'
          ? t('agent.web.consent.connector.update', { defaultValue: 'Open in Chrome Web Store' })
          : t('agent.web.consent.connector.install', { defaultValue: 'Install from Chrome Web Store' })}
      </Button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {t('agent.web.consent.connector.comeBack', { defaultValue: 'This page updates by itself once the Connector is installed.' })}
      </p>
    </>}
  </div>;
}

function Consent() {
  const { t } = useI18n();
  const [status, setStatus] = useState<WebAgentStatus | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Re-read on focus (back from the Web Store tab) and when the Connector announces itself.
  useEffect(() => {
    const refresh = () => void request('status').then(setStatus).catch(e => setError(e.message));
    const changed = (changes: Record<string, unknown>) => { if (WEB_CONNECTOR_SEEN_KEY in changes) refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    browser.storage.onChanged.addListener(changed);
    return () => {
      window.removeEventListener('focus', refresh);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);

  const accept = async () => {
    setBusy(true); setError('');
    try {
      setStatus(await request('accept-consent'));
      setTimeout(() => window.close(), 900);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const withdraw = async () => {
    setBusy(true); setError('');
    try { setStatus(await request('withdraw-consent')); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const accepted = !!status?.consented && status.permitted;

  return <main className="mx-auto max-w-[460px] px-6 py-7">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      <h1 className="text-[15px] font-semibold tracking-tight">
        {t('agent.web.consent.title', { defaultValue: 'Before you use the Web Agent' })}
      </h1>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
      {t('agent.web.consent.intro', { defaultValue: 'The Web Agent lets the AI read web pages and operate them for you: clicking, typing and running scripts in your browser. Please read this before turning it on.' })}
    </p>

    <ol className="mt-4 space-y-3">
      {RISKS.map((risk, i) => <li key={risk.key} className="flex gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">{i + 1}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{t(`agent.web.consent.risks.${risk.key}.title`, { defaultValue: risk.title })}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(`agent.web.consent.risks.${risk.key}.body`, { defaultValue: risk.body })}</p>
        </div>
      </li>)}
    </ol>

    {accepted ? <>
      <p className="mt-5 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t('agent.web.consent.accepted', { defaultValue: 'You have accepted this notice and the Web Agent is on. Withdrawing turns it off until you accept again.' })}
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void withdraw()}>
          {t('agent.web.consent.withdraw', { defaultValue: 'Withdraw' })}
        </Button>
        <Button className="flex-1" onClick={() => window.close()}>
          {t('agent.web.consent.done', { defaultValue: 'Done' })}
        </Button>
      </div>
    </> : <>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        {t('agent.web.consent.permissionNote', { defaultValue: 'The agent operates pages through Chrome\'s page debugger. While it works, Chrome shows a debugging bar on those pages.' })}
      </p>
      {status && !status.permitted && <ConnectorBox state={status.debugger} />}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={read} onChange={e => setRead(e.target.checked)} />
        <span>{t('agent.web.consent.checkbox', { defaultValue: 'I have read and understand these risks' })}</span>
      </label>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => window.close()}>
          {t('agent.web.consent.cancel', { defaultValue: 'Not now' })}
        </Button>
        <Button className="flex-1" disabled={!read || busy || !status?.permitted} onClick={() => void accept()}>
          {t('agent.web.consent.agree', { defaultValue: 'Agree' })}
        </Button>
      </div>
    </>}

    {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Consent />);
