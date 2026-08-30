import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodType
} from '@fastgpt/global/common/system/types';
import { useSystemStore } from './useSystemStore';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

type MyLLMModelType = Extract<MyModelItemType, { type: ModelTypeEnum.llm }>;
type MyEmbeddingModelType = Extract<MyModelItemType, { type: ModelTypeEnum.embedding }>;

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

export const getWebLLMModel = (model?: string, llmList: MyLLMModelType[] = []) => {
  const defaultModels = useUserModelStore.getState().defaultModels;

  if (!model) return defaultModels.llm;
  return llmList.find((item) => item.model === model || item.modelId === model);
};
export const getWebDefaultLLMModel = (llmList: MyLLMModelType[] = []) => {
  const defaultModels = useUserModelStore.getState().defaultModels;

  if (llmList.length === 0) return defaultModels.llm;
  return defaultModels.llm &&
    llmList.find(
      (item) =>
        item.modelId === defaultModels.llm?.modelId || item.model === defaultModels.llm?.model
    )
    ? defaultModels.llm
    : llmList[0];
};
export const getWebDefaultEmbeddingModel = (embeddingList: MyEmbeddingModelType[] = []) => {
  const defaultModels = useUserModelStore.getState().defaultModels;

  if (embeddingList.length === 0) return defaultModels.embedding;
  return defaultModels.embedding &&
    embeddingList.find(
      (item) =>
        item.modelId === defaultModels.embedding?.modelId ||
        item.model === defaultModels.embedding?.model
    )
    ? defaultModels.embedding
    : embeddingList[0];
};
