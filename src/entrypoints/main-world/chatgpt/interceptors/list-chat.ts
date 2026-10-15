import i18n from '@/locale/i18n-bundled';
import { trace } from '@/shared/lib/trace';


export function handleListChatResponse(response: any, url: string) {
  if (response.status === 200) {
    try {
      let responseBody = response.response;
      
      // Ensure responseBody is parsed as object
      if (typeof responseBody === 'string') {
        try {
          responseBody = JSON.parse(responseBody);
        } catch (e) {
          console.warn('Better Sidebar (ChatGPT): Could not parse response body', e);
          return;
        }
      }

      trace('Better Sidebar (ChatGPT): List Chat Response:', responseBody);

      // Extract chat items from response
      if (responseBody?.items && Array.isArray(responseBody.items)) {
        const items = responseBody.items.map((item: any) => {
          // Parse create_time to timestamp
          let createdAt: number | null = null;
          if (item.create_time) {
            try {
              createdAt = Math.floor(new Date(item.create_time).getTime() / 1000);
            } catch (e) {
              // ignore
            }
          }

          // Parse update_time to timestamp
          let updatedAt: number | null = null;
          if (item.update_time) {
            try {
              updatedAt = Math.floor(new Date(item.update_time).getTime() / 1000);
            } catch (e) {
              // ignore
            }
          }

          return {
            id: item.id,
            title: item.title || i18n.t('common.untitled'),
            created_at: createdAt,
            updated_at: updatedAt,
          };
        });

        console.log(`Better Sidebar (ChatGPT): Parsed ${items.length} chats`);

        // Dispatch event with parsed chat list
        globalThis.dispatchEvent(
          new CustomEvent('CHATGPT_LIST_CHAT_RESPONSE', {
            detail: {
              items,
              originalUrl: url,
            },
          })
        );
      }
    } catch (e) {
      console.error('Better Sidebar (ChatGPT): Error handling list chat response', e);
    }
  }
}
