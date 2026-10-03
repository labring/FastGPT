import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemDefaultModelType } from '../type';
import {
  SystemModelDocumentDataSchema,
  type SystemModelDataType,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';

const configKeysMap: Record<ModelTypeEnum, string[]> = {
  [ModelTypeEnum.llm]: [
    'maxContext',
    'maxResponse',
    'quoteMaxToken',
    'maxTemperature',
    'showTopP',
    'responseFormatList',
    'showStopSign',
    'censor',
    'vision',
    'audio',
    'video',
    'reasoning',
    'reasoningEffort',
    'functionCall',
    'toolChoice',
    'defaultSystemChatPrompt',
    'defaultConfig',
    'fieldMap'
  ],
  [ModelTypeEnum.embedding]: [
    'defaultToken',
    'maxToken',
    'weight',
    'hidden',
    'vision',
    'normalization',
    'batchSize',
    'defaultConfig',
    'dbConfig',
    'queryConfig'
  ],
  [ModelTypeEnum.rerank]: ['maxToken', 'defaultConfig'],
  [ModelTypeEnum.tts]: ['voices'],
  [ModelTypeEnum.stt]: []
};

/** 将插件扁平模型协议转换为 `ai_models` 使用的 canonical 文档。 */
export const flatModelToDocumentData = (
  input: Record<string, any>
): SystemModelDocumentDataType => {
  const normalized = { ...input };
  if (normalized.type === ModelTypeEnum.llm) {
    normalized.maxResponse = normalized.maxResponse ?? normalized.maxTokens ?? 16000;
  }

  const configKeys = configKeysMap[normalized.type as ModelTypeEnum] ?? [];
  const config = {
    ...Object.fromEntries(
      configKeys.filter((key) => normalized[key] !== undefined).map((key) => [key, normalized[key]])
    ),
    ...(normalized.config && typeof normalized.config === 'object' ? normalized.config : {})
  };

  return SystemModelDocumentDataSchema.parse(
    Object.fromEntries(
      Object.entries({ ...normalized, scope: ModelScopeEnum.system, config }).filter(
        ([, value]) => value !== undefined
      )
    )
  );
};

/** 生成可返回客户端的脱敏模型副本，不修改运行时快照对象。 */
export const desensitizeSystemModel = <T extends SystemModelDataType>(model: T): T => ({
  ...model,
  config: {
    ...model.config,
    defaultSystemChatPrompt: undefined,
    fieldMap: undefined,
    defaultConfig: undefined,
    dbConfig: undefined,
    queryConfig: undefined
  },
  requestUrl: undefined,
  requestAuth: undefined
});

/** 生成可返回客户端的系统默认模型配置。 */
export const desensitizeSystemDefaultModels = (defaultModels: SystemDefaultModelType) => ({
  [ModelTypeEnum.llm]: defaultModels.llm && desensitizeSystemModel(defaultModels.llm),
  datasetTextLLM:
    defaultModels.datasetTextLLM && desensitizeSystemModel(defaultModels.datasetTextLLM),
  datasetImageLLM:
    defaultModels.datasetImageLLM && desensitizeSystemModel(defaultModels.datasetImageLLM),
  chatTitleLLM: defaultModels.chatTitleLLM && desensitizeSystemModel(defaultModels.chatTitleLLM),
  [ModelTypeEnum.embedding]:
    defaultModels.embedding && desensitizeSystemModel(defaultModels.embedding),
  [ModelTypeEnum.tts]: defaultModels.tts && desensitizeSystemModel(defaultModels.tts),
  [ModelTypeEnum.stt]: defaultModels.stt && desensitizeSystemModel(defaultModels.stt),
  [ModelTypeEnum.rerank]: defaultModels.rerank && desensitizeSystemModel(defaultModels.rerank)
});

/** 写入前校验数据库模型与同名插件模板的类型一致。 */
export const assertSystemModelTypesMatchPluginTemplates = ({
  models,
  pluginDocuments
}: {
  models: Array<Pick<SystemModelDocumentDataType, 'model' | 'type'>>;
  pluginDocuments: Array<Pick<SystemModelDocumentDataType, 'model' | 'type'>>;
}) => {
  const pluginModelNames = new Set(pluginDocuments.map((model) => model.model));
  const pluginModelKeys = new Set(pluginDocuments.map((model) => `${model.type}:${model.model}`));
  for (const model of models) {
    if (pluginModelNames.has(model.model) && !pluginModelKeys.has(`${model.type}:${model.model}`)) {
      throw new UserError(
        `System model type does not match plugin template: ${model.model} (${model.type})`
      );
    }
  }
};
