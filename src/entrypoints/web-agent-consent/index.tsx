/**
 * The Web Agent risk notice, and the one place its permission is asked for.
 *
 * One window for both on purpose. `chrome.permissions.request` only works inside a click on
 * an extension page — a content script cannot call it — so the button that says "I agree" is
 * also the gesture Chrome needs. Agreeing without granting, or granting without having read
 * this, are both states the agent refuses to run in (`webAgentBlocker`).
 *
 * The order inside the click matters: the Chrome request has to be the first thing that
 * happens, before anything is awaited, or Chrome no longer counts it as the user's click.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle } from 'lucide-react';
import type { WebAgentStatus } from '@/shared/web-agent/contracts';
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

function Consent() {
  const { t } = useI18n();
  const [status, setStatus] = useState<WebAgentStatus | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { request('status').then(setStatus).catch(e => setError(e.message)); }, []);

  const accept = async () => {
    setBusy(true); setError('');
    try {
      // `debugger` cannot be an optional permission in Chrome, so there is nothing to
      // request here: it is either in the manifest or the agent cannot run at all.
      if (!(await chrome.permissions.contains({ permissions: ['debugger'] }))) {
        throw new Error(t('agent.web.consent.denied', { defaultValue: 'This build of Better Sidebar does not include the page debugger permission, so the Web Agent cannot run.' }));
      }
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
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={read} onChange={e => setRead(e.target.checked)} />
        <span>{t('agent.web.consent.checkbox', { defaultValue: 'I have read and understand these risks' })}</span>
      </label>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => window.close()}>
          {t('agent.web.consent.cancel', { defaultValue: 'Not now' })}
        </Button>
        <Button className="flex-1" disabled={!read || busy || !status} onClick={() => void accept()}>
          {t('agent.web.consent.agree', { defaultValue: 'Agree' })}
        </Button>
      </div>
    </>}

    {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Consent />);
