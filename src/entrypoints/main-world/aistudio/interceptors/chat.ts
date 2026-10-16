import { parseConversation } from '../lib/response-parser';
import { trace } from '@/shared/lib/trace';

/**
 * @param isActivity Whether this response reflects new activity on the prompt
 *   (a save or a create). `ResolveDriveResource` is just the user opening a chat,
 *   and must not bump `last_active_at` — otherwise every opened chat jumps to the
 *   top of the list.
 */
export function handleChatResponse(response: any, url: string, isActivity = true) {
  if (response.status === 200 || response.response) {
    let responseBody = response.response;
    if (typeof responseBody !== 'string') {
      responseBody = JSON.stringify(responseBody);
    }

    let json;
    try {
      const cleanBody = responseBody.replace(/^\)\]\}'/, '').trim();
      json = JSON.parse(cleanBody);
    } catch (e) {
      console.error('Better Sidebar: JSON parse error', e);
      return;
    }

    const parsedData = parseConversation(json);

    if (parsedData && parsedData.messages.length > 0) {
      console.log(
        `Better Sidebar: Parsed chat data, ${parsedData.messages.length} message(s)`,
      );
      trace('Better Sidebar: Parsed chat data:', parsedData);

      globalThis.dispatchEvent(
        new CustomEvent('AI_STUDIO_RESPONSE', {
          detail: {
            ...parsedData,
            is_activity: isActivity,
            originalUrl: url,
          },
        })
      );
    }
  }
}
