import { getModelProviderMetadata } from '../../app/provider/controller';
import type { SystemDefaultModelType } from '../type';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  type EmbeddingSystemModelDataType,
  type LLMSystemModelDataType,
  type RerankSystemModelDataType,
  type STTSystemModelDataType,
  type TTSSystemModelDataType,
  SystemModelDocumentDataSchema,
  SystemModelDataSchema,
  type SystemModelDataType,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { getModelProvider } from '../../../core/app/provider/controller';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { preloadModelProviders } from '../../../core/app/provider/controller';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';
import { UserError } from '@fastgpt/global/common/error/utils';
import { clearAllMyModelsCache } from '../../../support/permission/model/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { readSystemModelSnapshot, readSystemModelRevision } from './entity';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { createModelHandle, getCachedModelHandle, publishModelHandle } from './handle';

/**
 * 插件模型协议为了便于声明，将不同模型类型的能力字段平铺在顶层；数据库 canonical
 * 结构则要求这些字段收敛到 `config`。这里按模型类型维护允许搬入 `config` 的字段，
 * 避免把身份、连接、计费或插件返回的未知字段误当成模型能力配置。
 */
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

/**
 * 将运行期插件返回的扁平模型转换成可写入 `ai_models` 的 canonical 文档。
 *
 * 转换约定：
 * - 模型身份、展示、连接和计费字段仍保留在顶层；
 * - 当前模型类型支持的能力字段搬入 `config`；
 * - 输入已经携带的 `config` 优先级更高，用于兼容逐步切换到 canonical 协议的插件；
 * - 最后通过领域 Zod Schema 校验并剔除未知字段，禁止未定义结构进入数据库。
 */
export const flatModelToDocumentData = (
  input: Record<string, any>
): SystemModelDocumentDataType => {
  // 复制后再做兼容转换，不能修改插件客户端持有的原始响应对象。
  const normalized = { ...input };
  if (normalized.type === ModelTypeEnum.llm) {
    // 插件旧协议使用 maxTokens；数据库统一使用 maxResponse。显式的新字段优先。
    normalized.maxResponse = normalized.maxResponse ?? normalized.maxTokens ?? 16000;
  }

  const configKeys = configKeysMap[normalized.type as ModelTypeEnum] ?? [];
  const config = {
    // 只过滤 undefined，确保 false、0 和空数组等有效配置不会被误删。
    ...Object.fromEntries(
      configKeys.filter((key) => normalized[key] !== undefined).map((key) => [key, normalized[key]])
    ),
    // canonical config 覆盖旧扁平字段，避免新协议值被兼容字段反向覆盖。
    ...(normalized.config && typeof normalized.config === 'object' ? normalized.config : {})
  };

  // scope 由 FastGPT 赋值；Schema 是最终边界，负责类型校验和未知字段清理。
  return SystemModelDocumentDataSchema.parse(
    Object.fromEntries(
      Object.entries({ ...normalized, scope: ModelScopeEnum.system, config }).filter(
        ([, value]) => value !== undefined
      )
    )
  );
};

/**
 * 生成可返回客户端的脱敏模型副本。系统模型对象还会被服务端请求链路复用，不能原地删除字段。
 */
export const desensitizeSystemModel = <T extends SystemModelDataType>(model: T): T => {
  return {
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
  } as T;
};

/**
 * 生成可返回客户端的系统默认模型配置。默认模型只表示系统配置，不代表当前用户具备使用权限。
 */
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

/** 获取插件模型的 canonical 初始文档；加载器与迁移脚本共用同一套扁平字段分拣规则。 */
export const getPluginSystemModelDocuments = async (): Promise<SystemModelDocumentDataType[]> =>
  pluginClient.listModels().then((models) => models.map((model) => flatModelToDocumentData(model)));

/**
 * 实时拉取并校验完整插件模型模板。模板只服务于管理员主动创建模型，不进入运行时缓存。
 */
export const refreshModelTemplates = async (): Promise<SystemModelDocumentDataType[]> => {
  return getPluginSystemModelDocuments();
};

/**
 * 校验数据库候选模型与同名插件模板的类型一致；必须在写入前调用，避免 reload 失败后留下坏数据。
 */
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

/**
 * 只读取数据库安装实例并原子发布运行时模型快照，不执行插件请求、历史迁移或自动预装。
 */
const publishInstalledModels = async ({
  language = 'en',
  skipPermissionCacheInvalidation = false
}: {
  language?: string;
  /** 启动阶段只发布初始快照，避免重启时删除仍然有效的成员目录缓存。 */
  skipPermissionCacheInvalidation?: boolean;
} = {}) => {
  const getPermissionCacheSignature = (models: SystemModelDataType[]) =>
    models
      .map((model) => `${model.modelId}:${model.model}`)
      .sort()
      .join('\n');
  const previousHandle = getCachedModelHandle();
  const previousPermissionCacheSignature = previousHandle
    ? getPermissionCacheSignature(previousHandle.getActiveModels())
    : undefined;

  const _systemModelList: SystemModelDataType[] = [];
  const _systemModelMap = new Map<string, SystemModelDataType>();
  const _systemDefaultModel: SystemDefaultModelType = {};

  const pushModel = (modelData: SystemModelDataType) => {
    _systemModelList.push(modelData);
    _systemModelMap.set(`id:${modelData.modelId}`, modelData);
    _systemModelMap.set(`model:${modelData.model}`, modelData);

    // 管理列表包含停用模型，统一解析价格可避免旧字段或单档双零在列表中显示错误。
    if (modelData.type === ModelTypeEnum.llm) {
      modelData.priceTiers = getRuntimeResolvedPriceTiers(modelData);
    }
  };

  try {
    const {
      models: dbModels,
      defaultModelIds: configuredDefaultModelIds,
      revision
    } = await readSystemModelSnapshot();
    const dbDocuments = dbModels.map((dbModel) => SystemModelDocumentDataSchema.parse(dbModel));

    dbModels.forEach((dbModel, index) => {
      const dbDocument = dbDocuments[index];

      const provider = getModelProvider(dbDocument.provider, language);
      const runtimeModel = SystemModelDataSchema.parse({
        ...dbDocument,
        modelId: String(dbModel._id),
        provider: provider.id,
        avatar: provider.avatar
      });

      pushModel(runtimeModel);
    });

    // 默认配置只保存稳定 ID。无效配置留给成员目录按类型回退，不再读取模型布尔字段修复。
    const configuredModel = <T extends SystemModelDataType>(
      modelId: string | undefined,
      predicate: (model: SystemModelDataType) => model is T
    ) => {
      const model = modelId ? _systemModelMap.get(`id:${modelId}`) : undefined;
      return model?.isActive && predicate(model) ? model : undefined;
    };
    _systemDefaultModel.llm = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.llm,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetTextLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.datasetTextLLM,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.datasetImageLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.datasetImageLLM,
      (model): model is LLMSystemModelDataType =>
        model.type === ModelTypeEnum.llm && !!model.config.vision
    );
    _systemDefaultModel.chatTitleLLM = configuredModel<LLMSystemModelDataType>(
      configuredDefaultModelIds.chatTitleLLM,
      (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
    );
    _systemDefaultModel.embedding = configuredModel<EmbeddingSystemModelDataType>(
      configuredDefaultModelIds.embedding,
      (model): model is EmbeddingSystemModelDataType => model.type === ModelTypeEnum.embedding
    );
    _systemDefaultModel.tts = configuredModel<TTSSystemModelDataType>(
      configuredDefaultModelIds.tts,
      (model): model is TTSSystemModelDataType => model.type === ModelTypeEnum.tts
    );
    _systemDefaultModel.stt = configuredModel<STTSystemModelDataType>(
      configuredDefaultModelIds.stt,
      (model): model is STTSystemModelDataType => model.type === ModelTypeEnum.stt
    );
    _systemDefaultModel.rerank = configuredModel<RerankSystemModelDataType>(
      configuredDefaultModelIds.rerank,
      (model): model is RerankSystemModelDataType => model.type === ModelTypeEnum.rerank
    );

    // Active 列表沿用 MongoDB 的新建时间倒序；后续可由持久化 order 字段接管排序。
    const _systemActiveModelList = _systemModelList.filter((model) => model.isActive);

    // Default model check
    {
      if (!_systemDefaultModel.llm) {
        _systemDefaultModel.llm = _systemActiveModelList.find(
          (model): model is LLMSystemModelDataType => model.type === ModelTypeEnum.llm
        );
      }
      if (!_systemDefaultModel.datasetTextLLM) {
        _systemDefaultModel.datasetTextLLM = _systemDefaultModel.llm;
      }
      if (!_systemDefaultModel.datasetImageLLM) {
        _systemDefaultModel.datasetImageLLM = _systemActiveModelList.find(
          (model): model is LLMSystemModelDataType =>
            model.type === ModelTypeEnum.llm && !!model.config.vision
        );
      }
      if (!_systemDefaultModel.embedding) {
        _systemDefaultModel.embedding = _systemActiveModelList.find(
          (model): model is EmbeddingSystemModelDataType => model.type === ModelTypeEnum.embedding
        );
      }
      if (!_systemDefaultModel.tts) {
        _systemDefaultModel.tts = _systemActiveModelList.find(
          (model): model is TTSSystemModelDataType => model.type === ModelTypeEnum.tts
        );
      }
      if (!_systemDefaultModel.stt) {
        _systemDefaultModel.stt = _systemActiveModelList.find(
          (model): model is STTSystemModelDataType => model.type === ModelTypeEnum.stt
        );
      }
      if (!_systemDefaultModel.rerank) {
        _systemDefaultModel.rerank = _systemActiveModelList.find(
          (model): model is RerankSystemModelDataType => model.type === ModelTypeEnum.rerank
        );
      }
    }

    const nextPermissionCacheSignature = getPermissionCacheSignature(_systemActiveModelList);
    if (
      !skipPermissionCacheInvalidation &&
      previousPermissionCacheSignature !== undefined &&
      previousPermissionCacheSignature !== nextPermissionCacheSignature
    ) {
      // 只有已发布快照中的模型身份发生变化才失效缓存；首次启动没有可比较的旧快照。
      await clearAllMyModelsCache();
    }

    // 完整目录与内容版本一起发布，不暴露多次赋值的半成品。
    {
      const version = hashStr(
        JSON.stringify({
          schemaVersion: 1,
          // 模型顺序属于目录内容；安装实例变化后必须触发客户端缓存更新。
          models: _systemActiveModelList.map(desensitizeSystemModel),
          providers: getModelProviderMetadata().providers,
          defaultModelIds: configuredDefaultModelIds
        })
      );
      publishModelHandle(
        createModelHandle({
          models: _systemModelList,
          defaultModels: _systemDefaultModel,
          configuredDefaultModelIds,
          revision,
          version
        })
      );
    }

    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.debug('System models loaded', {
      total: _systemModelList.length,
      active: _systemActiveModelList.length
    });
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System models load failed', { error });

    return Promise.reject(error);
  }
};

let modelReload: Promise<void> | undefined;

/** 同一进程只允许一个加载器发布目录，避免慢的旧加载覆盖较新的快照。 */
export const loadInstalledModels = (options?: Parameters<typeof publishInstalledModels>[0]) => {
  if (!modelReload) {
    modelReload = publishInstalledModels(options).finally(() => {
      modelReload = undefined;
    });
  }
  return modelReload;
};

let modelRefresh: Promise<void> | undefined;

/**
 * 尽力读取最新目录，版本检查与快照加载总共最多等待 5 秒。
 * 失败或超时沿用已成功发布的本地快照（包括空目录）；首次加载没有快照时仍报错。
 * race 不取消底层加载，迟到的完整快照仍可正常发布，不能伪造修订号或清空旧缓存。
 */
export const refreshModelHandle = async () => {
  const refresh = async () => {
    const requiredRevision = await readSystemModelRevision();
    while (!getCachedModelHandle() || getCachedModelHandle()!.revision < requiredRevision) {
      await loadInstalledModels();
    }
  };

  try {
    modelRefresh ??= refresh().finally(() => {
      modelRefresh = undefined;
    });
    await withTimeout(modelRefresh, 5000, 'Model catalog refresh timed out');
  } catch (error) {
    const handle = getCachedModelHandle();
    if (!handle) throw error;
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Using local model catalog after refresh failure',
      {
        error,
        revision: handle.revision
      }
    );
  }
};

/**
 * 启动依赖 Plugin Provider 元数据；模板 listModels 不参与已安装实例的加载和运行。
 * 历史模型迁移由阻塞升级任务负责。
 */
export const loadSystemModels = async (refresh = false, language = 'en') => {
  if (!refresh && getCachedModelHandle()) return;

  try {
    const isInitialLoad = !getCachedModelHandle();
    await preloadModelProviders();
    await loadInstalledModels({
      language,
      skipPermissionCacheInvalidation: isInitialLoad
    });
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.CONFIG).error('System models orchestration failed', {
      error
    });
    return Promise.reject(error);
  }
};

/** 写入已提交后尽力刷新本节点，失败保留诊断；后续模型读屏障负责重试，不能误报写入失败。 */
export const updatedReloadSystemModel = async () => {
  await refreshModelHandle().catch((error) => {
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Model write committed; catalog refresh pending',
      { error }
    );
  });
};
