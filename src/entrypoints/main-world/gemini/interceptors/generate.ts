import {
  parseStreamingResponse,
  extractWrbFrPayloads,
} from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import { detectGeminiContext } from '@/shared/lib/gemini-context';

export function handleGenerateResponse(response: any, url: string) {
  if (response.status === 200) {
    let prompt: string | null = null;
    let requestNotebookId: string | null = null;
    // Parse Request
    try {
      const requestBody = response.config?.body;
      // Also check if config.data exists (axios sometimes uses data instead of body)
      const requestData = requestBody || response.config?.data;

      if (requestData && typeof requestData === 'string') {
        const parsedBody = parseBatchExecuteRequest(requestData);

        // Generate specific logic to extract prompt
        // Try-catch simplified access
        try {
          // The second element contains the inner JSON string -> parsedBody[1]
          // innerJson[0][0] -> prompt
          const innerJsonString = parsedBody?.[1];
          if (typeof innerJsonString === 'string') {
            const innerJson = JSON.parse(innerJsonString);
            const promptCandidate = innerJson?.[0]?.[0];
            if (typeof promptCandidate === 'string') {
              prompt = promptCandidate;
            }

            // Detect notebook from request payload.
            // innerJson[21] = "notebooks/<uuid>" when chatting inside a notebook.
            const nbField = innerJson?.[21];
            if (typeof nbField === 'string' && nbField.startsWith('notebooks/')) {
              requestNotebookId = nbField.slice('notebooks/'.length);
            }
          }
        } catch (e) {
          // ignore
        }

        if (prompt) {
          console.log('Better Sidebar (Gemini): Parsed User Prompt:', prompt);
        }
        if (requestNotebookId) {
          console.log('Better Sidebar (Gemini): Detected notebook from request:', requestNotebookId);
        }
      }
    } catch (e) {
      console.error(
        'Better Sidebar (Gemini): Error handling generate request',
        e,
      );
    }

    let responseBody = response.response;

    // Ensure responseBody is a string
    if (typeof responseBody !== 'string') {
      try {
        responseBody = JSON.stringify(responseBody);
      } catch (e) {
        console.warn(
          'Better Sidebar (Gemini): Could not stringify response body',
          e,
        );
        return;
      }
    }

    try {
      const retChunks = parseStreamingResponse(responseBody);

      console.log(
        'Better Sidebar (Gemini): Parsed StreamGenerate chunks:',
        retChunks,
      );
      const chunks = retChunks.map((chunk) => chunk[0]);
      if (chunks.length > 0) {
        // Use common helper to extract payloads
        const payloads = extractWrbFrPayloads(chunks);

        if (payloads.length > 0) {
          let targetPayload: any = null;
          let targetPayloadIndex = -1;

          // 倒着找，找到第一个[4]?.[0]?.[1]?.[0]有内容的
          for (let i = payloads.length - 1; i >= 0; i--) {
            const p = payloads[i];
            try {
              const content = p?.[4]?.[0]?.[1]?.[0];
              if (content) {
                targetPayload = p;
                targetPayloadIndex = i;
                break;
              }
            } catch (e) {
              // ignore
            }
          }

          console.log(
            'Better Sidebar (Gemini): Parsed Payload:',
            targetPayloadIndex,
            targetPayload,
          );

          if (targetPayload) {
            try {
              const contentCandidate = targetPayload?.[4]?.[0]?.[1]?.[0];
              const conversationId = targetPayload?.[1]?.[0]?.replace(
                /^c_/,
                '',
              );
              const responseMessageId = targetPayload?.[1]?.[1];

              console.log(
                'Better Sidebar (Gemini): Response Message ID from payload[1][1]:',
                responseMessageId,
              );

              if (contentCandidate && conversationId) {
                console.log(
                  'Better Sidebar (Gemini): Target Content:',
                  contentCandidate,
                );
                console.log(
                  'Better Sidebar (Gemini): Conversation ID:',
                  conversationId,
                );

                // 找标题: 倒着找 payload[10][0] 有内容
                let title: string | undefined;
                for (let i = payloads.length - 1; i >= 0; i--) {
                  try {
                    const t =
                      payloads[i]?.[10]?.[0] || payloads[i]?.[2]?.[11]?.[0];
                    if (typeof t === 'string' && t) {
                      title = t;
                      break;
                    }
                  } catch (e) {
                    // ignore
                  }
                }

                const messages = [];
                const timestamp = Math.floor(Date.now() / 1000);

                // User Message — ID from payload[1][1] (r_xxx format)
                const userMessageId = responseMessageId;

                console.log(
                  'Better Sidebar (Gemini): User Message ID:',
                  userMessageId,
                );

                // Model Message — ID from payload[4][0][0] (rc_xxx format)
                const modelMessageId = targetPayload?.[4]?.[0]?.[0];

                console.log(
                  'Better Sidebar (Gemini): Model Message ID:',
                  modelMessageId,
                );

                if (prompt) {
                  messages.push({
                    role: 'user',
                    id: userMessageId || crypto.randomUUID(),
                    conversation_id: conversationId,
                    content: prompt,
                    message_type: 'text',
                    created_at: timestamp,
                  });
                }

                // Model Message
                messages.push({
                  role: 'model',
                  id: modelMessageId || crypto.randomUUID(),
                  conversation_id: conversationId,
                  content: contentCandidate,
                  message_type: 'text',
                  created_at: timestamp,
                });

                if (title) {
                  // Detect the parent context (plain chat / gem / notebook)
                  // Priority: URL gem → request notebook id → conversation
                  const ctx = detectGeminiContext(
                    globalThis.location?.pathname || '',
                    requestNotebookId,
                  );

                  globalThis.dispatchEvent(
                    new CustomEvent('BETTER_SIDEBAR_PROMPT_CREATE', {
                      detail: {
                        id: conversationId,
                        title,
                        messages,
                        created_at: timestamp,
                        type: ctx.type,
                        gem_id: ctx.gemId ?? undefined,
                        notebook_id: ctx.notebookId ?? undefined,
                      },
                    }),
                  );
                } else {
                  globalThis.dispatchEvent(
                    new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
                      detail: {
                        conversationId,
                        messages,
                      },
                    }),
                  );
                }
              }
            } catch (e) {
              console.error(
                'Better Sidebar (Gemini): Error parsing target payload',
                e,
              );
            }
          }
        }
      }
    } catch (e) {
      console.error(
        'Better Sidebar (Gemini): Error handling generate response',
        e,
      );
    }
  }
}
