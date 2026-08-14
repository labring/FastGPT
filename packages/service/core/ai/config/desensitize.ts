import type { SystemDefaultModelType, SystemModelItemType } from '../type';

/**
 * 生成可返回客户端的脱敏模型副本。系统模型对象还会被服务端请求链路复用，不能原地删除字段。
 */
export const desensitizeSystemModel = <T extends SystemModelItemType>(model: T): T =>
  ({
    ...model,
    defaultSystemChatPrompt: undefined,
    fieldMap: undefined,
    defaultConfig: undefined,
    weight: undefined,
    dbConfig: undefined,
    queryConfig: undefined,
    requestUrl: undefined,
    requestAuth: undefined
  }) as T;

/**
 * 生成可返回客户端的系统默认模型配置。默认模型只表示系统配置，不代表当前用户具备使用权限。
 */
export const desensitizeSystemDefaultModels = (
  defaultModels: SystemDefaultModelType
): SystemDefaultModelType => ({
  llm: defaultModels.llm && desensitizeSystemModel(defaultModels.llm),
  datasetTextLLM:
    defaultModels.datasetTextLLM && desensitizeSystemModel(defaultModels.datasetTextLLM),
  datasetImageLLM:
    defaultModels.datasetImageLLM && desensitizeSystemModel(defaultModels.datasetImageLLM),
  embedding: defaultModels.embedding && desensitizeSystemModel(defaultModels.embedding),
  tts: defaultModels.tts && desensitizeSystemModel(defaultModels.tts),
  stt: defaultModels.stt && desensitizeSystemModel(defaultModels.stt),
  rerank: defaultModels.rerank && desensitizeSystemModel(defaultModels.rerank)
});
