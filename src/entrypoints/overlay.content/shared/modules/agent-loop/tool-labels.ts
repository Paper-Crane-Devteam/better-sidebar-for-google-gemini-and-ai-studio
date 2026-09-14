/**
 * Human-readable labels for tool calls.
 *
 * Tool names are protocol identifiers: `execute_sql` tells someone who doesn't write
 * SQL nothing at all, and reads worse than nothing when it's the most prominent text
 * on the card. The AI supplies a plain-language `description` for most calls — this
 * is the fallback for the ones where it doesn't, so no card ever leads with a
 * snake_case identifier.
 */

/** The `t` from useI18n, narrowed to what this module needs. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Does this statement change data, as opposed to just reading it? */
function isWriteQuery(query: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i.test(query);
}

/**
 * A plain-language label for a tool call.
 *
 * `query` only refines `execute_sql`, where "looking through" and "changing" are
 * very different things to be told about your own data.
 */
export function getToolLabel(toolName: string, t: Translate, query?: string): string {
  switch (toolName) {
    case 'execute_sql':
      return query && isWriteQuery(query)
        ? t('agent.tool.dataWrite', { defaultValue: 'Changing your data' })
        : t('agent.tool.dataRead', { defaultValue: 'Looking through your data' });
    case 'sync_conversation_messages':
      return t('agent.tool.sync', { defaultValue: 'Fetching conversation content' });
    case 'export':
      return t('agent.tool.export', { defaultValue: 'Exporting' });
    case 'complete_task':
      return t('agent.tool.complete', { defaultValue: 'Wrapping up' });
    case 'read_file':
      return t('agent.tool.readFile', { defaultValue: 'Reading a file' });
    case 'write_file':
      return t('agent.tool.writeFile', { defaultValue: 'Writing a file' });
    case 'edit_file':
      return t('agent.tool.editFile', { defaultValue: 'Editing a file' });
    case 'list_files':
      return t('agent.tool.listFiles', { defaultValue: 'Looking through the workspace' });
    case 'glob_files':
      return t('agent.tool.globFiles', { defaultValue: 'Finding files' });
    case 'grep_files':
      return t('agent.tool.grepFiles', { defaultValue: 'Searching in files' });
    case 'manage_files':
      return t('agent.tool.manageFiles', { defaultValue: 'Reorganizing files' });
    case 'doc_read':
      return t('agent.tool.docRead', { defaultValue: 'Reading a document' });
    case 'doc_edit':
      // "Marking up" rather than "Editing": the change lands as a Word revision the user
      // still has to accept, and a card that says "Editing your document" overstates what
      // is about to happen to the file.
      return t('agent.tool.docEdit', { defaultValue: 'Marking up a document' });
    default:
      return t('agent.tool.generic', { defaultValue: 'Running a step' });
  }
}
