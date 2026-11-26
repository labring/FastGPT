import { UserError } from '@fastgpt/global/common/error/utils';
import {
  ModelScopeEnum,
  ModelTypeEnum,
  REASONING_EFFORT_LEVELS
} from '@fastgpt/global/core/ai/constants';
import { normalizeReasoningEffortList } from '@fastgpt/global/core/ai/llm/utils';
import {
  AIModelDocumentDataSchema,
  ModelPricingSchema,
  STTModelPricingSchema,
  type AIModelDataType,
  type AIModelDocumentDataType
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
    'reasoningEffortList',
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

/**
 * 读取边界兼容归一化：
 * - 过滤历史或高版本插件带来的未识别思考等级并按标准顺序去重，避免单个未知枚举值阻断目录或模板加载；
 * - 开启深度思考与思考配置但 `reasoningEffortList` 缺失或为空时，加载期统一兜底为全部思考等级；
 * - 写入 API 仍由 LLMModelConfigSchema 严格校验。
 */
const normalizeLlmConfigForRead = (
  type: unknown,
  config: unknown
): Record<string, unknown> | unknown => {
  if (
    type !== ModelTypeEnum.llm ||
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config)
  ) {
    return config;
  }
  const llmConfig = config as Record<string, unknown>;
  const normalizedList = Array.isArray(llmConfig.reasoningEffortList)
    ? normalizeReasoningEffortList(
        llmConfig.reasoningEffortList.filter((item): item is string => typeof item === 'string')
      )
    : [];

  if (llmConfig.reasoning === true && llmConfig.reasoningEffort === true) {
    return {
      ...llmConfig,
      reasoningEffortList: normalizedList.length > 0 ? normalizedList : [...REASONING_EFFORT_LEVELS]
    };
  }

  if (!Array.isArray(llmConfig.reasoningEffortList)) {
    return config;
  }
  return {
    ...llmConfig,
    reasoningEffortList: normalizedList
  };
};

/**
 * 统一数据库模型的读取契约，供运行目录与管理员 JSON 导出复用，保留配置及凭证字段。
 * 历史 STT 价格缺少类型时按时长读取；无法识别的价格按免费处理，避免阻断业务。
 * 不回写数据库；后台迁移记录坏数据，新 API/JSON 写入仍严格校验。
 */
export const formatDbModelToDocumentData = (
  dbModel: Record<string, unknown>
): AIModelDocumentDataType => {
  const pricing = (() => {
    const { pricing } = dbModel;
    if (pricing === undefined || pricing === null) return undefined;
    if (dbModel.type === ModelTypeEnum.stt) {
      const missingType =
        typeof pricing === 'object' && !Array.isArray(pricing) && !('type' in pricing);
      const result = STTModelPricingSchema.safeParse(
        missingType ? { ...pricing, type: 'duration' } : pricing
      );
      return result.success ? result.data : undefined;
    }
    // 旧阶梯上限由迁移读取。这里仅保留新上限及价格，尚未回填时首档按无限上限计费。
    const result = ModelPricingSchema.safeParse(pricing);
    return result.success ? result.data : undefined;
  })();
  return AIModelDocumentDataSchema.parse({
    ...dbModel,
    config: normalizeLlmConfigForRead(dbModel.type, dbModel.config),
    pricing
  });
};

/** 将插件扁平模型协议转换为 `ai_models` 使用的 canonical 文档。 */
export const flatModelToDocumentData = (input: Record<string, any>): AIModelDocumentDataType => {
  const normalized = { ...input };
  if (normalized.type === ModelTypeEnum.llm) {
    normalized.maxResponse = normalized.maxResponse ?? normalized.maxTokens ?? 16000;
  }

  const configKeys = configKeysMap[normalized.type as ModelTypeEnum] ?? [];
  const config = normalizeLlmConfigForRead(normalized.type, {
    ...Object.fromEntries(
      configKeys.filter((key) => normalized[key] !== undefined).map((key) => [key, normalized[key]])
    ),
    ...(normalized.config && typeof normalized.config === 'object' ? normalized.config : {})
  });

  return AIModelDocumentDataSchema.parse(
    Object.fromEntries(
      Object.entries({ ...normalized, scope: ModelScopeEnum.system, config }).filter(
        ([, value]) => value !== undefined
      )
    )
  );
};

/** 生成可返回客户端的脱敏模型副本，不修改运行时快照对象。 */
export const desensitizeModel = <T extends AIModelDataType>(model: T): T => ({
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

/** 写入前校验数据库模型与同名插件模板的类型一致。 */
export const assertSystemModelTypesMatchPluginTemplates = ({
  models,
  pluginDocuments
}: {
  models: Array<Pick<AIModelDocumentDataType, 'model' | 'type'>>;
  pluginDocuments: Array<Pick<AIModelDocumentDataType, 'model' | 'type'>>;
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
