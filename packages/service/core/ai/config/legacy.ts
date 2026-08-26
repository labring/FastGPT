import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { LegacySystemModelCollectionName } from './constants';
import { repairSystemModelDocument } from './repair';
import { MongoAIModel } from './schema';

export type BootstrapAIModelsResult = {
  status: 'skipped' | 'migrated';
  sourceCount: number;
};

/**
 * 首次升级时把旧 system_models 快照一次性复制到 ai_models。
 *
 * 旧集合始终只读；所有源数据会先在内存中完成修复、校验和去重，再在单个事务中复查目标
 * 为空并一次 insertMany。任一记录无效时不会向目标集合写入任何数据。
 */
export const bootstrapAIModelsFromLegacy = async ({
  pluginDocuments
}: {
  pluginDocuments: SystemModelDocumentDataType[];
}): Promise<BootstrapAIModelsResult> => {
  if ((await MongoAIModel.estimatedDocumentCount()) > 0) {
    return { status: 'skipped', sourceCount: 0 };
  }

  // 故意通过原生 collection 读取，避免在旧表上注册 Schema、索引或写入中间状态。
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);
  const records = await legacyCollection.find({}).sort({ _id: 1 }).toArray();
  const pluginMap = new Map(pluginDocuments.map((item) => [item.model, item]));
  const modelIds = new Set<string>();
  type MigrationCandidate = SystemModelDocumentDataType & {
    _id: (typeof records)[number]['_id'];
  };
  const candidatesByModel = new Map<string, MigrationCandidate>();

  for (const record of records) {
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
    candidatesByModel.set(result.document.model, { _id: record._id, ...result.document });
  }
  const candidates = Array.from(candidatesByModel.values());

  try {
    return await mongoSessionRun(async (session) => {
      if ((await MongoAIModel.countDocuments({}, { session })) > 0) {
        return { status: 'skipped', sourceCount: records.length };
      }
      if (candidates.length > 0) {
        await MongoAIModel.collection.insertMany(candidates, { ordered: true, session });
      }
      return { status: 'migrated', sourceCount: records.length };
    });
  } catch (error) {
    // 多实例可能同时通过事务前的空表判断。若另一实例已完整写入同一批 ID，本实例可收敛为成功。
    const migratedModelsById = new Map(
      (
        await MongoAIModel.collection
          .find(
            { _id: { $in: records.map((record) => record._id) } },
            { projection: { _id: 1, model: 1 } }
          )
          .toArray()
      ).map((record) => [String(record._id), record.model])
    );
    if (
      candidates.length > 0 &&
      candidates.every(
        (candidate) => migratedModelsById.get(String(candidate._id)) === candidate.model
      )
    ) {
      return { status: 'skipped', sourceCount: records.length };
    }
    throw error;
  }
};
