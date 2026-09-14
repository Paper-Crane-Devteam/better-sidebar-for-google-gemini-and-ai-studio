/**
 * Skill Layer — Type definitions.
 */

/** Skill definition — builtin and custom share the same shape */
export interface Skill {
  id: string;
  type: 'builtin' | 'custom';
  /**
   * Which agent this skill belongs to.
   *
   * A skill is detail for one agent's domain, so it is only offered to that agent: the
   * Workspace agent must not be told a conversation-classifying skill exists, because it
   * has no `execute_sql` to carry it out and would spend a round finding that out.
   *
   * ⚠️ Optional on the type, not in practice. Custom skills persisted before agents existed
   * have no value here, so `skill-registry` fills in the default rather than dropping them —
   * a user's own skill vanishing after an update is the worse failure.
   */
  agentId?: string;
  title: string;
  description: string;
  /**
   * i18n key for the title (builtin skills only).
   * When present, UI resolves via `t(titleKey)` instead of using `title` directly.
   * `title` remains the English fallback used in the prompt and search.
   */
  titleKey?: string;
  /** i18n key for the description (builtin skills only). */
  descriptionKey?: string;
  icon: string;
  promptContent: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
