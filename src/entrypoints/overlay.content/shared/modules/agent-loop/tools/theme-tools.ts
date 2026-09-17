/**
 * Theme tools — the extension's appearance, as three tool calls.
 *
 * There was already an AI route to a custom theme, and it was all manual: Theme Settings
 * wrote a prompt into the library, the user ran it in the chat, selected the JSON reply,
 * opened Import Theme, pasted, confirmed. Five steps of clipboard work between "I want a
 * warm sunset theme" and seeing one, and every step is a place to lose the JSON.
 *
 * These three close that loop inside one conversation: `list_themes` to see what is there,
 * `create_theme` to save what the model wrote, `apply_theme` to switch to it. The manual
 * route stays exactly as it was — it needs no agent session and works on any platform.
 *
 * ⚠️ Nothing here re-implements validation or the licence rules. `create_theme` runs the
 * same `validateUserTheme` the import dialog runs, and `apply_theme` goes through
 * `selectTheme`, which is where "premium theme, no licence, therefore a timed preview"
 * lives. A second copy of either would have drifted on its first bug fix.
 *
 * ## Why these are not gated as writes
 *
 * All three are left at the default `read` risk (see `execution-policy.getToolRisk`), so they
 * run without an approval click. Deliberate: a saved theme is an added row the user can delete
 * from Settings → Themes, and applying one is the most visible action in the extension — the
 * page changes colour in front of them, and one click in the picker puts it back. There is
 * nothing an approval prompt would tell them that the result does not.
 *
 * The consent that does matter is a different one, and it is a prompt concern rather than a
 * policy one: do not re-colour someone's screen because a theme happened to get created. The
 * skill tells the model to offer and wait.
 */

import i18n from '@/locale/i18n';
import { toast } from '@/shared/lib/toast';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import {
  refreshThemeRegistry,
  themePresetIds,
  themeRegistry,
  useUserThemeStore,
  validateUserTheme,
} from '@/themes';
import { selectTheme, THEME_PREVIEW_DURATION_MS } from '@/themes/theme-actions';
import { paywallResult } from './paywall-signal';

/** Words the model uses for "put it back to how the platform looks". */
const DEFAULT_ALIASES = new Set(['', 'default', 'none', 'null', 'off', 'reset', 'platform']);

/** How many validation errors are worth reporting before the list stops helping. */
const MAX_REPORTED_ERRORS = 8;

/** The preview window in whole minutes, so the two places that quote it cannot disagree. */
function previewMinutes(): number {
  return Math.round(THEME_PREVIEW_DURATION_MS / 60000);
}

// ─── list_themes ─────────────────────────────────────────────────────────────

/**
 * Every theme the user could switch to, plus what is on right now.
 *
 * The active id matters as much as the list: "make it a bit warmer" is a request to base a
 * new theme on the current one, and without this the model has to ask which one that is.
 */
export function listThemes(): string {
  refreshThemeRegistry();

  const activeId = usePegasusStore.getState().customTheme;
  const licensed = isLicenseValid(useLicenseStore.getState());
  const userThemes = useUserThemeStore.getState().themes;

  const lines: string[] = [];

  lines.push(
    activeId
      ? `Active theme: ${activeId}${themeRegistry[activeId] ? ` ("${themeRegistry[activeId].name}")` : ' (missing from the registry)'}`
      : 'Active theme: none — the page is using its own default look.',
  );
  lines.push(
    licensed
      ? 'Support Pack: active, so themes can be saved and applied permanently.'
      : 'Support Pack: not active. Custom themes cannot be saved, and applying any theme runs ' +
          `as a ${previewMinutes()}-minute preview that reverts by itself.`,
  );

  lines.push('', `Built-in themes (${themePresetIds.length}):`);
  for (const id of themePresetIds) {
    const preset = themeRegistry[id];
    if (!preset) continue;
    lines.push(`- ${id} — ${preset.name} (${preset.preferredMode ?? 'either'}) — ${preset.description}`);
  }

  lines.push('', userThemes.length === 0 ? 'Your own themes: none yet.' : `Your own themes (${userThemes.length}):`);
  for (const theme of userThemes) {
    lines.push(`- ${theme.id} — ${theme.name} (${theme.preferredMode}) — ${theme.description}`);
  }

  lines.push(
    '',
    'Use apply_theme to switch to one of these ids, or apply_theme with theme_id "default" ' +
      'to go back to the platform look. create_theme with an id that is already in "your own ' +
      'themes" replaces that theme.',
  );

  return lines.join('\n');
}

// ─── create_theme ────────────────────────────────────────────────────────────

export interface CreateThemeParams {
  theme?: string;
}

/**
 * Strip what a model puts around JSON when it forgets it is filling in a parameter.
 *
 * Fenced blocks mostly. Cheap to undo here, and the alternative is a valid theme rejected
 * for its wrapper — which the model then rewrites from scratch, at a few thousand tokens.
 */
function unwrapJson(raw: string): string {
  let text = raw.trim();
  const fence = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  return text;
}

/**
 * Save a theme the model wrote, as one of the user's own.
 *
 * Same destination as the Import Theme dialog: `user-themes` storage, merged into the
 * registry, and premium by construction (`userThemeToPreset`) — a theme that took a
 * licence to save is not free to keep.
 *
 * ⚠️ Does not apply it. That is `apply_theme`, and the split is the point of the flow:
 * saving is cheap and reversible, switching the user's whole screen without being asked is
 * not. The skill tells the model to offer first.
 */
export function createTheme(params: CreateThemeParams): string {
  const raw = params.theme;
  if (!raw || !raw.trim()) {
    return (
      'ERROR: create_theme needs a "theme" parameter — the theme object itself. Write it as a ' +
      'real JSON object inside params, not as a quoted string.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(raw));
  } catch (e) {
    return (
      `ERROR: "theme" is not valid JSON — ${(e as Error).message}. Pass the theme as a real ` +
      'JSON object in params (params: {"theme": {"id": "...", ...}}), so it does not have to ' +
      'survive being quoted twice.'
    );
  }

  const validation = validateUserTheme(parsed);
  if (!validation.valid || !validation.theme) {
    const errors = validation.errors.slice(0, MAX_REPORTED_ERRORS);
    const omitted = validation.errors.length - errors.length;
    return (
      `ERROR: That theme is not usable yet:\n- ${errors.join('\n- ')}` +
      (omitted > 0 ? `\n- ...and ${omitted} more` : '') +
      '\nFix those and call create_theme again. Do not drop required variables to get past a ' +
      'validation error — a theme missing a surface or text colour renders the page unreadable.'
    );
  }

  const theme = validation.theme;

  /*
   * A user theme that shadows a built-in one is unreachable rather than broken: the picker
   * lists both rows, `themeRegistry` holds whichever was merged last, and deleting the user
   * copy is the only way to get the original back. Cheaper to refuse the id.
   */
  const existing = useUserThemeStore.getState().themes;
  const shadowsBuiltin = !!themeRegistry[theme.id] && !existing.some((t) => t.id === theme.id);
  if (shadowsBuiltin) {
    return (
      `ERROR: "${theme.id}" is the id of a built-in theme, so saving over it would hide the ` +
      'original. Pick a different kebab-case id and call create_theme again.'
    );
  }

  /*
   * The licence gate is the same one the Import dialog applies, and it is checked after
   * validation on purpose: a free user then hears that their theme is fine and what it
   * would cost to keep it, rather than being turned away before it was even looked at.
   */
  if (!isLicenseValid(useLicenseStore.getState())) {
    return paywallResult(
      `The theme "${theme.name}" is valid, but saving a custom theme needs the Support Pack, so ` +
        'it was not stored. The user has been shown an upgrade prompt. Do not retry — tell them ' +
        'the theme is ready and that built-in themes can still be previewed with apply_theme.',
    );
  }

  const replaced = existing.some((t) => t.id === theme.id);
  if (replaced) {
    useUserThemeStore.getState().updateTheme(theme.id, theme);
  } else {
    useUserThemeStore.getState().addTheme(theme);
  }
  refreshThemeRegistry();

  // Its own string rather than `importSuccess`, which says "imported and applied". Saving
  // does not apply anything here, and a toast claiming otherwise while the page has not
  // changed is the kind of small lie that makes people distrust the rest of the report.
  toast.success(
    i18n.t('themeSettings.themeSaved', {
      defaultValue: 'Custom theme saved — you can switch to it in Themes.',
    }),
  );

  const active = usePegasusStore.getState().customTheme === theme.id;

  return [
    replaced
      ? `Replaced the saved theme "${theme.id}" with the new version.`
      : `Saved "${theme.name}" as a custom theme (id: ${theme.id}).`,
    `It is now in Settings → Themes, where the user can switch to it or delete it at any time.`,
    active
      ? 'It is also the theme currently in use, so the change is already visible.'
      : 'It is not applied yet. Ask the user whether they want it on now, and use apply_theme ' +
        `with theme_id "${theme.id}" if they say yes.`,
  ].join('\n');
}

// ─── apply_theme ─────────────────────────────────────────────────────────────

export interface ApplyThemeParams {
  theme_id?: string;
}

/**
 * Switch the page and sidebar to a theme, or back to the platform's own look.
 *
 * Named `applyThemeById` rather than `applyTheme` because `@/themes` already exports an
 * `applyTheme` that writes CSS variables onto the body — a different layer entirely, and
 * two identically named functions one import apart is a mistake waiting to be made.
 */
export function applyThemeById(params: ApplyThemeParams): string {
  const requested = (params.theme_id ?? '').trim();

  if (DEFAULT_ALIASES.has(requested.toLowerCase())) {
    selectTheme(null);
    return 'Reverted to the platform default look. No custom theme is active now.';
  }

  const outcome = selectTheme(requested);

  if (outcome.status === 'unknown') {
    const known = [...themePresetIds, ...useUserThemeStore.getState().themes.map((t) => t.id)];
    return (
      `ERROR: There is no theme with the id "${requested}". Call list_themes to see what ` +
      `exists — the ids are: ${known.join(', ')}.`
    );
  }

  const name = themeRegistry[outcome.themeId!]?.name ?? outcome.themeId;

  if (outcome.status === 'preview') {
    return (
      `Applied "${name}" as a preview. Tell the user plainly: without the Support Pack it ` +
      `reverts to the default look after about ${previewMinutes()} minutes, and also on the next page ` +
      'reload. Settings → Themes has the upgrade button if they want to keep it.'
    );
  }

  return `Applied "${name}". The page and the sidebar have switched over, and it stays until changed.`;
}
