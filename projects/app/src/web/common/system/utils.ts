import {
  type EmbeddingModelItemType,
  type LLMModelItemType
} from '@fastgpt/global/core/ai/model.schema';
import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodType
} from '@fastgpt/global/common/system/types';
import { useSystemStore } from './useSystemStore';
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
