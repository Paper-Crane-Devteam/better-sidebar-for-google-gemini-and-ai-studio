import { parseStreamingResponse, extractWrbFrPayloads } from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';

export function handleListChatResponse(response: any, url: string) {
  if (response.status === 200) {
    // Parse Request
    try {
        const requestBody = response.config?.body;
        const requestData = requestBody || response.config?.data;
        if (requestData && typeof requestData === 'string') {
            const parsedBody = parseBatchExecuteRequest(requestData);
            console.log('Better Sidebar (Gemini): Parsed List Chat Request:', parsedBody);
        }
    } catch (e) {
        console.error('Better Sidebar (Gemini): Error handling list chat request', e);
    }

    let responseBody = response.response;
    
    if (typeof responseBody !== 'string') {
       try {
         responseBody = JSON.stringify(responseBody);
       } catch (e) {
         console.warn('Better Sidebar (Gemini): Could not stringify response body', e);
         return;
       }
    }

    try {
      const retChunks = parseStreamingResponse(responseBody);
      const chunks = retChunks.map(chunk => chunk[0]);
      
      console.log('Better Sidebar (Gemini): List Chat chunks:', chunks);

      if (chunks.length > 0) {
        const items: any[] = [];
        
        // Use common helper to extract payloads
        const payloads = extractWrbFrPayloads(chunks);
        
        for (const payload of payloads) {
            try {
                // User says: payload[2] is the list
                // Use try-catch/optional chaining to simplify
                const chatList = payload?.[2];
                
                if (Array.isArray(chatList)) {
                     for (const chatItem of chatList) {
                         try {
                             // Example item: ["id","Title",null,null,null,[1770271826,895639000],...]
                             const id = chatItem?.[0];
                             const title = chatItem?.[1];
                             let createdAtSeconds = null;
                             
                             const timeArr = chatItem?.[5];
                             if (Array.isArray(timeArr) && timeArr.length > 0) {
                                 createdAtSeconds = timeArr[0];
                             }
                             
                             if (id) {
                                const gemId = chatItem?.[7] || null;
                                items.push({
                                    id: id.replace(/^c_/, ''),
                                    title,
                                    created_at: createdAtSeconds,
                                    type: gemId ? 'gem' : 'conversation',
                                    gem_id: gemId,
                                });
                             }
                         } catch (itemErr) {
                             // ignore individual item error
                         }
                     }
                }
            } catch (payloadErr) {
                // ignore payload error
            }
        }
        
        if (items.length > 0) {
            console.log(`Better Sidebar (Gemini): Parsed ${items.length} chats`);
        }

        globalThis.dispatchEvent(
          new CustomEvent('GEMINI_LIST_CHAT_RESPONSE', {
            detail: {
              items, // The parsed list of chats
              originalUrl: url
            }
          })
        );
      }
    } catch (e) {
      console.error('Better Sidebar (Gemini): Error handling list chat response', e);
    }
  }
}
