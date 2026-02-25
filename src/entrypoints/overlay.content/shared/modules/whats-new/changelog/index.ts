import i18n from '@/locale/i18n';
import type { ChangeLogItem } from './types';
import { changelog as en } from './en';
import { changelog as zhCN } from './zh-CN';
import { changelog as zhTW } from './zh-TW';
import { changelog as ja } from './ja';

export { CURRENT_VERSION } from './types';
export type { ChangeLogItem } from './types';

const changelogMap: Record<string, ChangeLogItem[]> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
};

/**
 * Get the changelog for the current i18n language.
 * Falls back to English for unsupported languages.
 */
export function getChangelog(): ChangeLogItem[] {
  const lang = i18n.language;
  return changelogMap[lang] ?? en;
}
