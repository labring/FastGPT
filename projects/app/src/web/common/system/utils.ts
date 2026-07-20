import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodType
} from '@fastgpt/global/common/system/types';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

/**
 * 获取真实支持的自助注册方式，兼容过滤旧配置中被混入的 sync 团队模式。
 */
export const getRegisterMethods = (feConfigs?: FastGPTFeConfigsType): FastGPTRegisterMethodType[] =>
  feConfigs?.register_method?.filter(
    (method): method is FastGPTRegisterMethodType => method === 'email' || method === 'phone'
  ) ?? [];

/**
 * 判断是否为成员同步模式。teamMode 是当前权威字段；旧 register_method: ['sync']
 * 仅用于兼容缺少 teamMode 的历史配置，避免新旧字段冲突时前后端模式不一致。
 */
export const getIsMemberSyncMode = (feConfigs?: FastGPTFeConfigsType) => {
  if (feConfigs?.teamMode) {
    return feConfigs.teamMode === 'sync';
  }

  return !!feConfigs?.register_method?.includes('sync');
};

export const downloadFetch = async ({
  url,
  filename,
  body,
  waitResponse = false
}: {
  url: string;
  filename: string;
  body?: Record<string, any>;
  waitResponse?: boolean;
}) => {
  if (body || waitResponse) {
    const response = await fetch(getWebReqUrl(url), {
      method: body ? 'POST' : 'GET',
      ...(body
        ? {
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          }
        : {})
    });

    if (!response.ok) {
      throw new Error((await response.text()) || response.statusText);
    }

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

/**
 * Look up an llm model by id (or legacy model name) in the given list.
 * Pure helper: the caller owns the list (fetched lazily via useActiveSystemModelList
 * or getModelList). Returns undefined when the model is not in the list.
 */
export const getWebLLMModel = <T extends { id: string; model: string }>(
  modelId?: string,
  llmList: T[] = []
): T | undefined => llmList.find((item) => item.id === modelId || item.model === modelId);
/** First llm of the list as the fallback default (design §3.2 fallback). */
export const getWebDefaultLLMModel = (llmList: { id: string }[] = []) => llmList[0];
/** First embedding model of the list as the fallback default. */
export const getWebDefaultEmbeddingModel = (embeddingList: { id: string }[] = []) =>
  embeddingList[0];
