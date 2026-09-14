import { parsePromptType } from '../lib/response-parser';
import { handleChatResponse } from './chat';

/**
 * @param isTemporary Whether the sidebar asked for this to be a temporary chat.
 *   Only meaningful here, on the event that creates the row — later turns arrive
 *   via AI_STUDIO_RESPONSE and attach to a row that is already marked.
 */
export function handleCreatePromptResponse(
  response: any,
  url: string,
  isTemporary = false,
) {
  if (response.status === 200) {
    let responseBody = response.response;
    if (typeof responseBody !== 'string') {
      responseBody = JSON.stringify(responseBody);
    }

    const json = JSON.parse(responseBody);

    if (Array.isArray(json)) {
      const promptPath = json[0];
      const metaArray = json[4];
      const createdAt = json[4]?.[4]?.[0]?.[0];

      if (typeof promptPath === 'string') {
        const id = promptPath.split('/').pop();
        let title = '';
        let promptMetadata = null;
        let type = 'conversation';

        if (Array.isArray(metaArray)) {
          if (metaArray.length > 0) {
            title = metaArray[0];
          }
          if (metaArray.length > 2) {
            promptMetadata = metaArray[2];
          }
          type = parsePromptType(metaArray?.[11]);
        }

        if (id) {
          console.log(`Better Sidebar: Detected new prompt creation: ${id}`);
          if (isTemporary) {
            console.log(
              `Better Sidebar: Marking new prompt as a temporary chat: ${id}`,
            );
          }
          globalThis.dispatchEvent(
            new CustomEvent('BETTER_SIDEBAR_PROMPT_CREATE', {
              detail: {
                id,
                title,
                prompt_metadata: promptMetadata,
                created_at: createdAt || Math.floor(Date.now() / 1000),
                originalUrl: url,
                type,
                is_temporary: isTemporary,
              },
            })
          );
        }
      }
    }

    handleChatResponse(response, url);
  }
}
