/**
 * The Browser Agent permission window.
 *
 * ## Four switches, not eight
 *
 * This page used to render one checkbox per `Capability` — eight of them, six of which
 * only differed by which object they read. That was the tool layer's vocabulary leaking
 * into the one screen where a user has to make a decision, and it read as "why does a
 * browser have eight permissions". `CAPABILITY_GROUPS` is the answer to the question the
 * user is actually being asked — organize or remove, for tabs and for bookmarks
 * separately — and the eight still exist underneath, unchanged.
 *
 * ## And almost no prose
 *
 * Everything the old page explained — tier warnings, which Chrome permission backs which
 * switch, where the audit journal lives, what an undo cannot restore — was true and
 * belonged in the design doc, not here. What survived is the one sentence per switch that
 * says what it lets the AI do, plus the URL note behind a `?` since it is a privacy choice
 * rather than a description.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpCircle } from 'lucide-react';
import {
  CAPABILITY_SECTIONS, CAPABILITY_SECTION_IDS, DEFAULT_SETTINGS, capabilitiesForGroups, groupsOf, permissionsFor,
  type BrowserSettings, type Capability, type CapabilityGroup,
} from '@/shared/browser-agent/contracts';
import { applyCachedExtensionPageTheme, syncExtensionPageTheme, watchExtensionPageTheme } from '@/shared/lib/extension-page-theme';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import { Switch } from '@/shared/components/ui/switch';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import '@/locale/i18n';
import '@/index.scss';

// Replay the cached theme before the first paint, then reconcile with the
// stored preference. This window can stay open while the theme is changed in
// the sidebar, so it also keeps watching.
applyCachedExtensionPageTheme();
void syncExtensionPageTheme();
watchExtensionPageTheme();

async function request(settings?: BrowserSettings) {
  const result = await browser.runtime.sendMessage({ type: 'BROWSER_AGENT', payload: settings ? { action: 'configure', settings } : { action: 'settings' } });
  if (!result.success) throw new Error(result.error);
  return result.data as BrowserSettings;
}

function Row({ label, note, help, checked, disabled, onChange }: {
  label: string; note?: string; help?: string;
  checked: boolean; disabled: boolean; onChange: (next: boolean) => void;
}) {
  return <div className="flex items-center justify-between gap-6 py-3">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {help && <SimpleTooltip content={help} side="bottom">
          {/* A button, not the icon on its own: this is the only way the note can be
              reached without a pointer, and Radix needs a focusable trigger for that. */}
          <button type="button" aria-label={help} className="text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </SimpleTooltip>}
      </div>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
    <Switch className="shrink-0" checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>;
}

function Settings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const groups = groupsOf(settings.capabilities);

  useEffect(() => {
    request().then(async loaded => {
      // A list stored by the per-object build cannot be drawn on the switches without one
      // of them lying, so it is narrowed to what they can express. Always a subset, which
      // is why this needs no permission request and can run without a user gesture.
      const capabilities = capabilitiesForGroups(groupsOf(loaded.capabilities));
      setSettings(capabilities.length === loaded.capabilities.length ? loaded : await request({ ...loaded, capabilities }));
    }).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, []);

  /**
   * `grant` is the capability set being moved *to*, or undefined when the change only
   * takes things away. The Chrome request has to be the first thing that happens: it is
   * only honoured inside the click gesture, so nothing may be awaited before it.
   */
  const change = async (next: BrowserSettings, grant?: Capability[]) => {
    setBusy(true); setError('');
    try {
      if (grant?.length && !await chrome.permissions.request({ permissions: permissionsFor(grant) })) {
        throw new Error(t('agent.browser.settings.denied', { defaultValue: 'Not granted. The switch stays off.' }));
      }
      setSettings(await request(next));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleGroup = (group: CapabilityGroup, on: boolean) => {
    const next = on ? [...groups, group] : groups.filter(g => g !== group);
    const capabilities = capabilitiesForGroups(next);
    void change({ ...settings, capabilities }, on ? capabilities : undefined);
  };

  return <main className="mx-auto max-w-[420px] px-6 py-7">
    <h1 className="text-[15px] font-semibold tracking-tight">
      {t('agent.browser.settings.title', { defaultValue: 'Browser Agent' })}
    </h1>

    {CAPABILITY_SECTION_IDS.map(section => <section key={section} className="mt-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t(`agent.browser.settings.section.${section}`, { defaultValue: section })}
      </h2>
      <div className="mt-1 divide-y divide-border/40">
        {CAPABILITY_SECTIONS[section].map(group => <Row
          key={group}
          label={t(`agent.browser.settings.group.${group}`, { defaultValue: group })}
          note={t(`agent.browser.settings.group.${group}Note`, { defaultValue: '' })}
          checked={groups.includes(group)}
          disabled={busy}
          onChange={on => toggleGroup(group, on)}
        />)}
      </div>
    </section>)}

    <Separator className="my-2 bg-border/40" />

    <Row
      label={t('agent.browser.settings.urlToggle', { defaultValue: 'Let the AI read full URLs' })}
      help={t('agent.browser.settings.urlHelp', { defaultValue: 'On: the full link is sent to the current AI conversation. Off: only the scheme and host — path, query and fragment stay hidden. Addresses already sent cannot be recalled.' })}
      checked={settings.shareFullUrls}
      disabled={busy}
      onChange={shareFullUrls => void change({ ...settings, shareFullUrls })}
    />

    {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}

    <Button className="mt-6 w-full" onClick={() => window.close()}>
      {t('agent.browser.settings.done', { defaultValue: 'Done' })}
    </Button>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Settings />);
