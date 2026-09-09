import {
  parseStreamingResponse,
  extractWrbFrPayloads,
} from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import { detectGeminiContext } from '@/shared/lib/gemini-context';
import { isGeminiTemporaryChat } from '@/shared/lib/dom-selectors';
import { trace } from '@/shared/lib/trace';

export function handleGenerateResponse(response: any, url: string) {
  if (response.status === 200) {
    let prompt: string | null = null;
    let requestNotebookId: string | null = null;
    // IDs from the request payload indicating the context position.
    // previousModelResponseId (rc_) marks the anchor: everything after it
    // in the DB will be deleted before inserting new messages. This handles
    // both regeneration (old messages removed) and normal flow (no-op).
    let previousModelResponseId: string | null = null;
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
            // innerJson[19] = "notebooks/<uuid>" when chatting inside a notebook.
            const nbField = innerJson?.[19];
            if (typeof nbField === 'string' && nbField.startsWith('notebooks/')) {
              requestNotebookId = nbField.slice('notebooks/'.length);
            }

            // Extract previous message context IDs from innerJson[2]:
            // [c_conversationId, r_userMessageId, rc_modelResponseId, ...]
            // These indicate the messages this request continues from.
            // On regeneration, rc_ is the OLD model response to be replaced.
            const contextArray = innerJson?.[2];
            if (Array.isArray(contextArray)) {
              const rcId = contextArray[2];
              if (typeof rcId === 'string' && rcId.startsWith('rc_')) {
                previousModelResponseId = rcId;
              }
            }
          }
        } catch (e) {
          // ignore
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
      const chunks = retChunks.map((chunk) => chunk[0]);
      if (chunks.length > 0) {
        // Use common helper to extract payloads
        const payloads = extractWrbFrPayloads(chunks);

        if (payloads.length > 0) {
          let targetPayload: any = null;

          // 倒着找，找到第一个[4]?.[0]?.[1]?.[0]有内容的
          for (let i = payloads.length - 1; i >= 0; i--) {
            const p = payloads[i];
            try {
              const content = p?.[4]?.[0]?.[1]?.[0];
              if (content) {
                targetPayload = p;
                break;
              }
            } catch (e) {
              // ignore
            }
          }

          if (!targetPayload) {
            trace(
              `Better Sidebar (Gemini): No content payload found (${payloads.length} payloads scanned)`,
            );
          }

          if (targetPayload) {
            try {
              const contentCandidate = targetPayload?.[4]?.[0]?.[1]?.[0];
              const conversationId = targetPayload?.[1]?.[0]?.replace(
                /^c_/,
                '',
              );
              const responseMessageId = targetPayload?.[1]?.[1];

              if (contentCandidate && conversationId) {
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

                // Model Message — ID from payload[4][0][0] (rc_xxx format)
                const modelMessageId = targetPayload?.[4]?.[0]?.[0];

                // Always pass replaceAfterMessageId when we have a previous
                // context rc_. This handles both normal messages (no-op delete
                // since nothing exists after the last message) and regeneration
                // (deletes the old messages that were after rc_).
                const replaceAfterMessageId = previousModelResponseId ?? undefined;

                console.log(
                  'Better Sidebar (Gemini): Captured turn',
                  {
                    conversationId,
                    userMessageId,
                    modelMessageId,
                    promptChars: prompt?.length ?? 0,
                    replyChars: contentCandidate.length,
                    ...(requestNotebookId ? { notebookId: requestNotebookId } : {}),
                    ...(replaceAfterMessageId ? { replacesAfter: replaceAfterMessageId } : {}),
                  },
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

                  // Only the row-creating event needs this. Later turns arrive as
                  // GEMINI_CHAT_CONTENT_RESPONSE and attach to a row that is
                  // already marked, so they carry no flag of their own.
                  const isTemporary = isGeminiTemporaryChat();
                  if (isTemporary) {
                    console.log(
                      'Better Sidebar (Gemini): Temporary chat detected, marking as hidden:',
                      conversationId,
                    );
                  }

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
                        replaceAfterMessageId,
                        is_temporary: isTemporary,
                      },
                    }),
                  );
                } else {
                  globalThis.dispatchEvent(
                    new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
                      detail: {
                        conversationId,
                        messages,
                        replaceAfterMessageId,
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
