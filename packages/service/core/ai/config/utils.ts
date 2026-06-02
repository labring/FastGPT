import type { SystemDefaultModelType, SystemModelItemType } from '../type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from './schema';
import {
  type LLMModelItemType,
  type EmbeddingModelItemType,
  type TTSModelType,
  type STTModelType,
  type RerankModelItemType,
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
} from '@fastgpt/global/core/ai/model.schema';
import { debounce } from 'lodash';
import { getModelProvider } from '../../../core/app/provider/controller';
import { getModelById } from '../model';
import {
  reloadFastGPTConfigBuffer,
  updateFastGPTConfigBuffer
} from '../../../common/system/config/controller';
import { delay } from '@fastgpt/global/common/system/utils';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { setCron } from '../../../common/system/cron';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { addLog } from '../../../common/system/log';
import { FastGPTProUrl } from '../../../common/system/constants';
import { GET } from '../../../common/api/plusRequest';
import { preloadModelProviders } from '../../../core/app/provider/controller';
import { refreshVersionKey } from '../../../common/cache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';
import type { ZodObject } from 'zod';
import { MongoUser } from '../../../support/user/schema';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

const leanToModelItem = (doc: any): SystemModelItemType => {
  const { _id, __v, ...rest } = doc;
  // Strip null/undefined values so they don't override plugin defaults
  const cleaned = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== null && v !== undefined)
  );
  return {
    ...cleaned,
    id: String(_id)
  } as SystemModelItemType;
};

/**
 * Normalize plugin model data before persisting to DB or merging into memory.
 * - Strips null/undefined values
 * - Parses with the type-specific Zod schema to apply defaults, strip unknown fields and validate
 */

// Pre-compiled schemas without `id` (plugin models don't have DB id yet)
const llmParseSchema = LLMModelItemSchema.omit({ id: true });
const embeddingParseSchema = EmbeddingModelItemSchema.omit({ id: true });
const ttsParseSchema = TTSModelItemSchema.omit({ id: true });
const rerankParseSchema = RerankModelItemSchema.omit({ id: true });
const sttParseSchema = STTModelItemSchema.omit({ id: true });

const schemaByType: Record<string, ZodObject> = {
  [ModelTypeEnum.llm]: llmParseSchema,
  [ModelTypeEnum.embedding]: embeddingParseSchema,
  [ModelTypeEnum.tts]: ttsParseSchema,
  [ModelTypeEnum.rerank]: rerankParseSchema,
  [ModelTypeEnum.stt]: sttParseSchema
};

const normalizeSystemModel = (model: any): any => {
  const cleaned = Object.fromEntries(
    Object.entries(model).filter(([, v]) => v !== null && v !== undefined)
  );

  const schema = schemaByType[model.type];
  if (!schema) return cleaned;

  const result = schema.safeParse(cleaned);
  return result.success ? result.data : cleaned;
};

const getRootMemberForSystemModelOwner = async () => {
  const rootUser = await MongoUser.findOne({ username: 'root' }, '_id').lean();
  if (!rootUser) return;

  const rootMember = await MongoTeamMember.findOne({ userId: rootUser._id }, '_id teamId').lean();
  if (!rootMember) return;

  return {
    rootTmbId: rootMember._id,
    rootTeamId: rootMember.teamId
  };
};

export const loadSystemModels = async (init = false, language = 'en') => {
  if (!init && global.systemModelList) return;

  try {
    await preloadModelProviders();
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System model provider preload failed', { error });
    return Promise.reject(error);
  }

  let _systemModelList: SystemModelItemType[] = [];
  let _systemActiveModelList: SystemModelItemType[] = [];
  let _systemModelIdMap = new Map<string, SystemModelItemType>();
  let _llmModelIdMap = new Map<string, LLMModelItemType>();
  let _embeddingModelIdMap = new Map<string, EmbeddingModelItemType>();
  let _ttsModelIdMap = new Map<string, TTSModelType>();
  let _sttModelIdMap = new Map<string, STTModelType>();
  let _reRankModelIdMap = new Map<string, RerankModelItemType>();
  let _systemDefaultModel: SystemDefaultModelType = {};

  if (!global.systemModelList) {
    global.systemModelList = [];
    global.systemActiveModelList = [];
    global.systemModelIdMap = new Map<string, SystemModelItemType>();
    global.llmModelIdMap = new Map<string, LLMModelItemType>();
    global.embeddingModelIdMap = new Map<string, EmbeddingModelItemType>();
    global.ttsModelIdMap = new Map<string, TTSModelType>();
    global.sttModelIdMap = new Map<string, STTModelType>();
    global.reRankModelIdMap = new Map<string, RerankModelItemType>();
    global.systemDefaultModel = {};
    global.systemActiveDesensitizedModels = [];
  }

  const pushModel = (model: SystemModelItemType) => {
    _systemModelList.push(model);

    _systemModelIdMap.set(model.id, model);

    if (model.isActive) {
      _systemActiveModelList.push(model);

      if (model.type === ModelTypeEnum.llm) {
        model.priceTiers = getRuntimeResolvedPriceTiers(model);

        _llmModelIdMap.set(model.id, model);
        if (model.isDefault) {
          _systemDefaultModel.llm = model;
        }
        if (model.isDefaultDatasetTextModel) {
          _systemDefaultModel.datasetTextLLM = model;
        }
        if (model.isDefaultDatasetImageModel) {
          _systemDefaultModel.datasetImageLLM = model;
        }
        if (model.isDefaultEvaluationModel) {
          _systemDefaultModel.evaluation = model;
        }
        if (model.model === process.env.HELPER_BOT_MODEL) {
          _systemDefaultModel.helperBotLLM = model;
        }
      } else if (model.type === ModelTypeEnum.embedding) {
        _embeddingModelIdMap.set(model.id, model);
        if (model.isDefault) {
          _systemDefaultModel.embedding = model;
        }
      } else if (model.type === ModelTypeEnum.tts) {
        _ttsModelIdMap.set(model.id, model);
        if (model.isDefault) {
          _systemDefaultModel.tts = model;
        }
      } else if (model.type === ModelTypeEnum.stt) {
        _sttModelIdMap.set(model.id, model);
        if (model.isDefault) {
          _systemDefaultModel.stt = model;
        }
      } else if (model.type === ModelTypeEnum.rerank) {
        _reRankModelIdMap.set(model.id, model);
        if (model.isDefault) {
          _systemDefaultModel.rerank = model;
        }
      }
    }
  };

  try {
    // Get model from db and plugin
    const [dbModelsResult, systemModels] = await Promise.all([
      MongoSystemModel.find({}).lean(),
      pluginClient
        .listModels()
        .then((res) => res)
        .catch(() => [])
    ]);
    let dbModels = dbModelsResult;

    // Persist system built-in models without MongoDB records so they have _id for modelId-based lookup
    {
      const pluginModelsWithoutDB = systemModels.filter(
        (model) => !dbModels.find((db) => db.model === model.model && db.isCustom !== true)
      );

      if (pluginModelsWithoutDB.length > 0) {
        const rootMember = await getRootMemberForSystemModelOwner();
        const modelNames = pluginModelsWithoutDB.map((m) => m.model);
        const refreshedDocs = await mongoSessionRun(async (session) => {
          // Use bulkWrite + upsert to safely handle concurrent startup across nodes
          await MongoSystemModel.bulkWrite(
            pluginModelsWithoutDB.map((model) => ({
              updateOne: {
                filter: { model: model.model, isCustom: false },
                update: {
                  $setOnInsert: {
                    ...normalizeSystemModel(model),
                    isCustom: false,
                    isShared: false,
                    ...(rootMember
                      ? {
                          teamId: rootMember.rootTeamId,
                          tmbId: rootMember.rootTmbId
                        }
                      : {})
                  }
                },
                upsert: true
              }
            })) as any,
            { ordered: false, session }
          );
          // Re-fetch to get _id values for both pre-existing and newly inserted records
          const refreshedDocs = await MongoSystemModel.find({
            model: { $in: modelNames },
            isCustom: false
          })
            .lean()
            .session(session);

          if (rootMember && refreshedDocs.length > 0) {
            await MongoResourcePermission.bulkWrite(
              refreshedDocs.map((doc) => {
                const resourceId = String(doc._id);
                return {
                  updateOne: {
                    filter: {
                      teamId: rootMember.rootTeamId,
                      tmbId: rootMember.rootTmbId,
                      resourceType: PerResourceTypeEnum.model,
                      resourceId
                    },
                    update: {
                      $setOnInsert: {
                        teamId: rootMember.rootTeamId,
                        tmbId: rootMember.rootTmbId,
                        resourceType: PerResourceTypeEnum.model,
                        resourceId,
                        permission: OwnerRoleVal
                      }
                    },
                    upsert: true
                  }
                };
              }),
              { ordered: false, session }
            );
          }

          return refreshedDocs;
        });
        dbModels = dbModels.filter((db) => !modelNames.includes(db.model) || db.isCustom !== false);
        dbModels.push(...refreshedDocs);
        addLog.info(`Persisted ${refreshedDocs.length} system models to MongoDB`);
      }
    }

    // Load system model from local
    systemModels.forEach((model) => {
      const mergeObject = (obj1: any, obj2: any) => {
        if (!obj1 && !obj2) return undefined;
        const formatObj1 = typeof obj1 === 'object' ? obj1 : {};
        const formatObj2 = typeof obj2 === 'object' ? obj2 : {};
        return { ...formatObj1, ...formatObj2 };
      };

      const dbModel = dbModels.find((item) => item.model === model.model && item.isCustom !== true);
      const provider = getModelProvider(dbModel?.provider || model.provider, language);

      const modelData: any = {
        ...normalizeSystemModel(model),
        ...(dbModel ? leanToModelItem(dbModel) : {}),
        provider: provider.id,
        avatar: provider.avatar,
        type: dbModel?.type || model.type,
        isCustom: false,

        ...(model.type === ModelTypeEnum.llm && {
          maxResponse: model.maxTokens ?? 16000
        }),

        ...(model.type === ModelTypeEnum.llm && dbModel?.type === ModelTypeEnum.llm
          ? {
              maxResponse: dbModel.maxResponse ?? model.maxTokens ?? 8000,
              defaultConfig: mergeObject(model.defaultConfig, dbModel.defaultConfig),
              fieldMap: mergeObject(model.fieldMap, dbModel.fieldMap),
              /** @deprecated */
              maxTokens: undefined
            }
          : {})
      };
      pushModel(modelData);
    });

    // Clean up orphaned system model DB records (plugin removed but DB record remains)
    {
      const systemModelNames = new Set(systemModels.map((m) => m.model));
      const orphanedIds = dbModels
        .filter((db) => db.isCustom === false && !systemModelNames.has(db.model))
        .map((db) => db._id);

      if (orphanedIds.length > 0) {
        await MongoSystemModel.deleteMany({ _id: { $in: orphanedIds } });
        dbModels = dbModels.filter((db) => !orphanedIds.includes(db._id));
        addLog.info(`Cleaned up ${orphanedIds.length} orphaned system model DB records`);
      }
    }

    // Custom model(Not in system config)
    dbModels.forEach((dbModel) => {
      if (_systemModelList.find((item) => item.id === dbModel._id.toString())) return;

      pushModel({
        ...leanToModelItem(dbModel),
        isCustom: true
      } as SystemModelItemType);
    });

    // Sort model list
    _systemActiveModelList.sort((a, b) => {
      const providerA = getModelProvider(a.provider, language);
      const providerB = getModelProvider(b.provider, language);
      return providerA.order - providerB.order;
    });

    // Default model check
    {
      if (!_systemDefaultModel.llm) {
        _systemDefaultModel.llm = Array.from(_llmModelIdMap.values())[0];
      }
      if (!_systemDefaultModel.datasetTextLLM) {
        _systemDefaultModel.datasetTextLLM = Array.from(_llmModelIdMap.values())[0];
      }
      if (!_systemDefaultModel.datasetImageLLM) {
        _systemDefaultModel.datasetImageLLM = undefined;
      }
      if (!_systemDefaultModel.evaluation) {
        _systemDefaultModel.evaluation = Array.from(_llmModelIdMap.values()).find(
          (item) => item.useInEvaluation
        );
      }
      if (!_systemDefaultModel.helperBotLLM) {
        _systemDefaultModel.helperBotLLM = _systemActiveModelList.find(
          (item) => item.type === ModelTypeEnum.llm
        );
      }
      if (!_systemDefaultModel.embedding) {
        _systemDefaultModel.embedding = Array.from(_embeddingModelIdMap.values())[0];
      }
      if (!_systemDefaultModel.tts) {
        _systemDefaultModel.tts = Array.from(_ttsModelIdMap.values())[0];
      }
      if (!_systemDefaultModel.stt) {
        _systemDefaultModel.stt = Array.from(_sttModelIdMap.values())[0];
      }
      if (!_systemDefaultModel.rerank) {
        _systemDefaultModel.rerank = Array.from(_reRankModelIdMap.values())[0];
      }
    }

    // Set global value
    {
      global.systemModelList = _systemModelList;
      global.systemActiveModelList = _systemActiveModelList;
      global.systemModelIdMap = _systemModelIdMap;
      global.llmModelIdMap = _llmModelIdMap;
      global.embeddingModelIdMap = _embeddingModelIdMap;
      global.ttsModelIdMap = _ttsModelIdMap;
      global.sttModelIdMap = _sttModelIdMap;
      global.reRankModelIdMap = _reRankModelIdMap;
      global.systemDefaultModel = _systemDefaultModel;
      global.systemActiveDesensitizedModels = _systemActiveModelList.map((model) => ({
        ...model,
        defaultSystemChatPrompt: undefined,
        fieldMap: undefined,
        defaultConfig: undefined,
        weight: undefined,
        dbConfig: undefined,
        queryConfig: undefined,
        requestUrl: undefined,
        requestAuth: undefined
      })) as SystemModelItemType[];
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

export const getSystemModelConfig = async (modelId: string): Promise<SystemModelItemType> => {
  const modelData = getModelById(modelId);
  if (!modelData) return Promise.reject('Model is not found');
  if (modelData.isCustom) return Promise.reject('Custom model not data');

  // Read file - use modelData.model (OpenAI name) to match against plugin models
  const modelDefaulConfig = await pluginClient
    .listModels()
    .then((models) => models.find((item) => item.model === modelData.model) as SystemModelItemType);

  return {
    ...modelDefaulConfig,
    provider: modelData.provider,
    isCustom: false
  };
};

export const watchSystemModelUpdate = () => {
  const changeStream = MongoSystemModel.watch();

  return changeStream.on(
    'change',
    debounce(async () => {
      try {
        // Main node will reload twice
        await loadSystemModels(true);
        // All node reaload buffer
        await reloadFastGPTConfigBuffer();
      } catch (error) {}
    }, 500)
  );
};

// 更新完模型后，需要重载缓存
export const updatedReloadSystemModel = async () => {
  // 1. 更新模型（所有节点都会触发）
  await loadSystemModels(true);
  // 2. 更新缓存（仅主节点触发）
  await updateFastGPTConfigBuffer();
  await refreshVersionKey(SystemCacheKeyEnum.modelPermission, '*');
  // 3. 延迟1秒，等待其他节点刷新
  await delay(1000);
};
export const cronRefreshModels = async () => {
  setCron('*/5 * * * *', async () => {
    // 1. 更新模型（所有节点都会触发）
    await loadSystemModels(true);
    // 2. 更新缓存（仅主节点触发）
    await updateFastGPTConfigBuffer();
  });
};

// prompt Loader
export interface PromptLoader {
  // Load Prompt from certain language
  loadTemplate(filename: string, locale: localeType, key: string): string;
}

declare global {
  var promptLoader: PromptLoader;
}

// Default Loader
export class DefaultPromptLoader implements PromptLoader {
  loadTemplate(filename: string, locale: localeType, key: string): string {
    return '';
  }
}

export const setPromptLoader = (loader: PromptLoader) => {
  global.promptLoader = loader;
};

export class ProPromptLoader implements PromptLoader {
  private cache: Map<string, string> = new Map();

  loadTemplate(filename: string, locale: localeType, key: string): string {
    const cacheKey = `${filename}_${key}_${locale}`;

    // Return from cache if available
    if (this.cache.has(cacheKey)) {
      addLog.debug(`[ProPromptLoader] Cache hit: ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    return '';
  }

  /**
   * Preload a single template
   */
  async preloadTemplate(filename: string, locale: localeType, key: string): Promise<void> {
    if (!FastGPTProUrl) throw new Error('FastGPTProUrl is not Configured');
    const template = await GET<string>(
      '/core/dataset/load',
      { filename, locale, key },
      { timeout: 5000 }
    );
    const cacheKey = `${filename}_${key}_${locale}`;
    this.cache.set(cacheKey, template);
  }

  /**
   * Preload all common templates
   */
  async preloadAllTemplates(): Promise<void> {
    const templates = [
      {
        filename: 'hypeIndexes',
        locale: 'zh-CN' as localeType,
        key: 'generate_question_from_faq_prompt'
      },
      {
        filename: 'hypeIndexes',
        locale: 'en' as localeType,
        key: 'generate_question_from_faq_prompt'
      },
      {
        filename: 'hypeIndexes',
        locale: 'zh-Hant' as localeType,
        key: 'generate_question_from_faq_prompt'
      },
      {
        filename: 'autoIndexes',
        locale: 'zh-CN' as localeType,
        key: 'auto_training_prompt'
      },
      {
        filename: 'autoIndexes',
        locale: 'en' as localeType,
        key: 'auto_training_prompt'
      },
      {
        filename: 'autoIndexes',
        locale: 'zh-Hant' as localeType,
        key: 'auto_training_prompt'
      },
      {
        filename: 'imageIndex',
        locale: 'zh-CN' as localeType,
        key: 'image_index_prompt'
      },
      {
        filename: 'imageIndex',
        locale: 'zh-Hant' as localeType,
        key: 'image_index_prompt'
      },
      {
        filename: 'imageIndex',
        locale: 'en' as localeType,
        key: 'image_index_prompt'
      }
    ];

    const results = await Promise.allSettled(
      templates.map((t) => this.preloadTemplate(t.filename, t.locale, t.key))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');

    if (succeeded.length === 0) {
      throw new Error('Failed to preload any templates');
    }

    addLog.info(
      `[ProPromptLoader] Successfully preloaded ${succeeded.length}/${templates.length} templates`
    );
  }
}
