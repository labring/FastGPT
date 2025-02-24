import { EmbeddingModelItemType, LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { useSystemStore } from './useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

export const downloadFetch = async ({
  url,
  filename,
  body
}: {
  url: string;
  filename: string;
  body?: Record<string, any>;
}) => {
  if (body) {
    // fetch data with POST method if body exists
    const response = await fetch(getWebReqUrl(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // clean up the blob URL
    window.URL.revokeObjectURL(downloadUrl);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

export const getWebLLMModel = (model?: string) => {
  const list = useSystemStore.getState().llmModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return list.find((item) => item.model === model || item.name === model) ?? defaultModels.llm!;
};
export const getWebDefaultLLMModel = (llmList: LLMModelItemType[] = []) => {
  const list = llmList.length > 0 ? llmList : useSystemStore.getState().llmModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return defaultModels.llm && list.find((item) => item.model === defaultModels.llm?.model)
    ? defaultModels.llm
    : list[0];
};
export const getWebDefaultEmbeddingModel = (embeddingList: EmbeddingModelItemType[] = []) => {
  const list =
    embeddingList.length > 0 ? embeddingList : useSystemStore.getState().embeddingModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return defaultModels.embedding &&
    list.find((item) => item.model === defaultModels.embedding?.model)
    ? defaultModels.embedding
    : list[0];
};
