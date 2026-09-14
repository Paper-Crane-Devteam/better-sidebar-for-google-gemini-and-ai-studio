import { handleChatResponse } from './chat';

function extractRequestData(body: any): {
  id: string | null;
  title: string | null;
} {
  let id: string | null = null;
  let title: string | null = null;

  let reqJson = body;
  if (typeof reqJson === 'string') {
    reqJson = JSON.parse(reqJson);
  }

  if (reqJson && Array.isArray(reqJson) && Array.isArray(reqJson[0])) {
    const item = reqJson[0];
    const promptPath = item[0];
    const titleData = item[4];

    if (typeof promptPath === 'string') {
      id = promptPath.split('/').pop() || null;
    }

    if (Array.isArray(titleData) && titleData.length > 0) {
      title = titleData[0];
    }
  }

  return { id, title };
}

function extractResponseData(body: any): { updated_at: number | null } {
  let updated_at: number | null = null;

  let responseBody = body;
  if (typeof responseBody === 'string') {
    responseBody = JSON.parse(responseBody);
  }

  if (responseBody && Array.isArray(responseBody)) {
    const timestamp = responseBody?.[4]?.[4]?.[0]?.[0];
    if (timestamp !== undefined && timestamp !== null) {
      updated_at = Number(timestamp);
    }
  }

  return { updated_at };
}

export function handleUpdatePromptResponse(response: any, url: string) {
  if (response.status === 200) {
    const { id, title } = extractRequestData(response.config.body);
    const { updated_at } = extractResponseData(response.response);

    if (id && (title || updated_at)) {
      console.log(
        `Better Sidebar: Detected update for ${id}. Title: ${title}, UpdatedAt: ${updated_at}`
      );

      const detail: any = {
        id,
        originalUrl: url,
      };

      if (title) detail.title = title;
      if (updated_at) detail.updated_at = updated_at;

      globalThis.dispatchEvent(
        new CustomEvent('AI_STUDIO_PROMPT_UPDATE', {
          detail,
        })
      );
    }

    handleChatResponse(response, url);
  }
}
