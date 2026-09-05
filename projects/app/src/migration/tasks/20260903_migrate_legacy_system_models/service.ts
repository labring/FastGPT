import {
  SystemModelDocumentDataSchema,
  type SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelDefaultIdsSchema, type ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import { getLegacyDefaultModelFlags, repairSystemModelDocument } from './utils';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { assertSystemModelTypesMatchPluginTemplates } from '@fastgpt/service/core/ai/config/utils';
import { upsertSystemDefaultModelIds } from '@fastgpt/service/core/ai/defaultModel/entity';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';

export type BootstrapAIModelsResult = {
  status: 'migrated';
  sourceCount: number;
  targetCount: number;
  migratedCount: number;
};

/**
 * 读取旧表与 system scope 新表数量。源记录数用于在空源场景跳过 Plugin 请求；
 * 目标记录数仅用于诊断，不决定任务是否执行。
 */
export const inspectLegacySystemModelMigration = async () => {
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);
  const [sourceCount, targetCount] = await Promise.all([
    legacyCollection.countDocuments(),
    MongoAIModel.countDocuments({ scope: ModelScopeEnum.system })
  ]);

  return { sourceCount, targetCount };
};

/**
 * 将旧 system_models 确定性合并到 ai_models。
 *
 * 同名模型保留新表 `_id`，其余 canonical 字段以旧表为准；旧表独有模型沿用旧 `_id`
 * 新增，新表独有模型保留。模型与默认配置在同一事务内写入，整体可幂等重放。
 */
export const bootstrapAIModelsFromLegacy = async ({
  pluginDocuments
}: {
  pluginDocuments: SystemModelDocumentDataType[];
}): Promise<BootstrapAIModelsResult> => {
  // 故意通过原生 collection 读取，避免在旧表上注册 Schema、索引或写入中间状态。
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);
  const records = await legacyCollection.find({}).sort({ _id: 1 }).toArray();
  const pluginMap = new Map(pluginDocuments.map((item) => [item.model, item]));
  const modelIds = new Set<string>();
  type MigrationCandidate = {
    document: SystemModelDocumentDataType & {
      _id: (typeof records)[number]['_id'];
    };
    defaultFlags: ReturnType<typeof getLegacyDefaultModelFlags>;
    order: number;
  };
  const candidatesByModel = new Map<string, MigrationCandidate>();

  for (const [order, record] of records.entries()) {
    const result = repairSystemModelDocument({
      record,
      pluginDocument: pluginMap.get(String(record.model))
    });
    if (result.status === 'invalid') {
      throw new Error(`Invalid legacy system model: ${String(record._id)}`);
    }

    const modelId = String(record._id);
    if (modelIds.has(modelId)) {
      throw new Error(`Duplicate legacy system model id: ${modelId}`);
    }
    modelIds.add(modelId);

    // 历史上若同名模型被重复保存，以较新的记录为准，避免唯一索引阻断整次迁移。
    candidatesByModel.set(result.document.model, {
      document: { _id: record._id, ...result.document },
      defaultFlags: getLegacyDefaultModelFlags(record),
      order
    });
  }
  const candidates = Array.from(candidatesByModel.values()).sort((a, b) => a.order - b.order);
  assertSystemModelTypesMatchPluginTemplates({
    models: candidates.map(({ document }) => document),
    pluginDocuments
  });

  return mongoSessionRun(async (session) => {
    // 同一 MongoDB 事务 session 内串行执行，避免驱动不支持的并行事务操作。
    const targetRecords = await MongoAIModel.collection
      .find({ scope: ModelScopeEnum.system }, { session })
      .toArray();
    const existingDefaultModel = await MongoAIDefaultModel.collection.findOne(
      { scope: ModelScopeEnum.system },
      { session }
    );
    const targetModels = targetRecords.map((record) => ({
      _id: record._id,
      document: SystemModelDocumentDataSchema.parse(record)
    }));
    const targetByModel = new Map<string, (typeof targetModels)[number]>();
    const targetById = new Map(targetModels.map((model) => [String(model._id), model]));
    for (const targetModel of targetModels) {
      if (targetByModel.has(targetModel.document.model)) {
        throw new Error(`Duplicate target system model: ${targetModel.document.model}`);
      }
      targetByModel.set(targetModel.document.model, targetModel);
    }

    const resolvedCandidates = candidates.map(({ document, defaultFlags }) => {
      const sameModel = targetByModel.get(document.model);
      const resolvedId = sameModel?._id ?? document._id;
      const idConflict = targetById.get(String(resolvedId));
      if (!sameModel && idConflict) {
        throw new Error(
          `Legacy system model id conflicts with target model: ${String(document._id)}`
        );
      }
      return {
        _id: resolvedId,
        document,
        defaultFlags,
        shouldInsert: !sameModel,
        shouldReplace: Boolean(sameModel)
      };
    });
    const candidatesToInsert = resolvedCandidates.filter(({ shouldInsert }) => shouldInsert);
    const candidatesToReplace = resolvedCandidates.filter(({ shouldReplace }) => shouldReplace);

    if (candidatesToInsert.length > 0 || candidatesToReplace.length > 0) {
      await MongoAIModel.collection.bulkWrite(
        [
          ...candidatesToInsert.map(({ _id, document }) => ({
            insertOne: {
              document: { ...document, _id }
            }
          })),
          ...candidatesToReplace.map(({ _id, document }) => ({
            replaceOne: {
              filter: { _id },
              replacement: { ...document, _id }
            }
          }))
        ],
        { ordered: true, session }
      );
    }

    const finalModelsById = new Map(
      targetModels.map(({ _id, document }) => [String(_id), document])
    );
    resolvedCandidates.forEach(({ _id, document }) => {
      finalModelsById.set(String(_id), document);
    });

    const legacyDefaultModelIds: ModelDefaultIds = {};
    for (const { _id, document, defaultFlags } of resolvedCandidates) {
      if (!document.isActive) continue;
      const modelId = String(_id);
      if (defaultFlags.isDefault) legacyDefaultModelIds[document.type] = modelId;
      if (document.type !== ModelTypeEnum.llm) continue;
      if (defaultFlags.isDefaultDatasetTextModel) legacyDefaultModelIds.datasetTextLLM = modelId;
      if (defaultFlags.isDefaultDatasetImageModel) legacyDefaultModelIds.datasetImageLLM = modelId;
      if (defaultFlags.isDefaultChatTitleModel) legacyDefaultModelIds.chatTitleLLM = modelId;
    }

    const defaultModelKeys = [
      ModelTypeEnum.llm,
      ModelTypeEnum.embedding,
      ModelTypeEnum.tts,
      ModelTypeEnum.stt,
      ModelTypeEnum.rerank,
      'datasetTextLLM',
      'datasetImageLLM',
      'chatTitleLLM'
    ] as const satisfies readonly (keyof ModelDefaultIds)[];
    const isValidDefaultModel = (key: keyof ModelDefaultIds, modelId: string) => {
      const model = finalModelsById.get(modelId);
      if (!model?.isActive) return false;
      if (key === 'datasetTextLLM' || key === 'chatTitleLLM') {
        return model.type === ModelTypeEnum.llm;
      }
      if (key === 'datasetImageLLM') {
        return model.type === ModelTypeEnum.llm && model.config.vision === true;
      }
      return model.type === key;
    };

    const existingDefaultModelIds = ModelDefaultIdsSchema.parse(
      existingDefaultModel?.defaultModelIds ?? {}
    );
    const mergedDefaultModelIds: ModelDefaultIds = { ...legacyDefaultModelIds };
    for (const key of defaultModelKeys) {
      const existingModelId = existingDefaultModelIds[key];
      if (existingModelId && isValidDefaultModel(key, existingModelId)) {
        mergedDefaultModelIds[key] = existingModelId;
      }
    }
    await upsertSystemDefaultModelIds(mergedDefaultModelIds, session);

    return {
      status: 'migrated',
      sourceCount: records.length,
      targetCount: finalModelsById.size,
      migratedCount: resolvedCandidates.length
    };
  });
};
