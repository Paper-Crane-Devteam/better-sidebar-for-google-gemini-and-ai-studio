import { parseStreamingResponse, extractWrbFrPayloads } from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import { trace } from '@/shared/lib/trace';

export function handleChatContentResponse(response: any, url: string) {
  if (response.status === 200) {
    // Parse Request
    try {
        const requestBody = response.config?.body;
        const requestData = requestBody || response.config?.data;
        if (requestData && typeof requestData === 'string') {
            const parsedBody = parseBatchExecuteRequest(requestData);
            trace('Better Sidebar (Gemini): Parsed Chat Content Request:', parsedBody);
        }
    } catch (e) {
        console.error('Better Sidebar (Gemini): Error handling chat content request', e);
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
      
      trace('Better Sidebar (Gemini): Chat Content chunks:', chunks);

      if (chunks.length > 0) {
        // Use common helper to extract payloads
        const payloads = extractWrbFrPayloads(chunks);
        trace('Better Sidebar (Gemini): Chat Content Payloads:', payloads);

        // Carries a scratch `_sortMs` ordering key, stripped before dispatch.
        const chatHistory: any[] = [];
        
        try {
          // payloads[0][0] is an array of dialog entries
          // We use optional chaining and try-catch to avoid deep checks
          const entries = payloads?.[0]?.[0];
          
          if (Array.isArray(entries)) {
              for (const entry of entries) {
                   try {
                       // User provided structure:
                       // user: entry[2][0][0]
                       // model: entry[3][0][0][1][0]
                       // timestamp: entry[4] -> [seconds, nanos]
                       const conversationId = entry?.[0]?.[0]?.replace(/^c_/, '');
                       const userContentId = entry?.[0]?.[1];
                       const modelContentId = entry?.[3]?.[3];
                       const userContent = entry?.[2]?.[0]?.[0];
                       
                       const modelContent = entry?.[3]?.[0]?.[0]?.[1]?.[0];
                       // entry[4] is a protobuf Timestamp: [seconds, nanos].
                       //
                       // Both halves matter. Gemini returns entries newest-first, and
                       // seconds alone cannot separate a question from its answer, so
                       // ordering on seconds left same-second pairs in reverse — visible
                       // as scrambled order_index once they reached the DB. The nanos
                       // resolve it, but only for sorting: `created_at` stays in seconds
                       // because `messages.timestamp` is seconds everywhere else, and
                       // conversations.created_at is derived from MIN() over it.
                       const timestampArr = entry?.[4];
                       
                       let timestamp = null;
                       // Undated entries sort last rather than to the epoch, so a
                       // single missing timestamp cannot drag an entry to the top.
                       let sortMs = Number.MAX_SAFE_INTEGER;
                       if (Array.isArray(timestampArr) && typeof timestampArr[0] === 'number') {
                           timestamp = timestampArr[0];
                           const nanos = typeof timestampArr[1] === 'number' ? timestampArr[1] : 0;
                           sortMs = timestamp * 1000 + nanos / 1e6;
                       }
                       
                       if (userContent) {
                           chatHistory.push({
                            role: 'user',
                            id: userContentId,
                            conversation_id: conversationId,
                            content: userContent,
                            message_type: 'text',
                            created_at: timestamp,
                            _sortMs: sortMs,
                           });
                       }
                       if(modelContent) {
                        chatHistory.push({
                            role: 'model',
                            id: modelContentId,
                            conversation_id: conversationId,
                            content: modelContent,
                            message_type: 'text',
                            created_at: timestamp,
                            _sortMs: sortMs,
                        });
                       }
                   } catch (innerErr) {
                       // Ignore individual entry parse errors
                   }
              }
          }
      } catch (err) {
          // Ignore payload parse errors
      }

        // Nothing parsed: bail before touching chatHistory[0].
        if (chatHistory.length === 0) {
          console.warn('Better Sidebar (Gemini): Chat Content had no parsable entries');
          return;
        }

        // Chronological order, then drop the scratch key. A stable sort keeps
        // user-before-model inside one entry, since both carry the entry's timestamp.
        chatHistory.sort((a, b) => a._sortMs - b._sortMs);
        const messages = chatHistory.map(({ _sortMs, ...msg }) => msg);

        console.log(`Better Sidebar (Gemini): Parsed ${messages.length} history items`);
        trace('Better Sidebar (Gemini): History items:', messages);

        globalThis.dispatchEvent(
          new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
            detail: {
              conversationId: messages[0].conversation_id,
              messages,
            }
          })
        );
      }
    } catch (e) {
      console.error('Better Sidebar (Gemini): Error handling chat content response', e);
    }
  }
}
