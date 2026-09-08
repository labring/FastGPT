import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';
import { backfillFlatModelFields } from '../4163_model_references/transforms';

/**
 * 按固定 endId 和 _id checkpoint 增量回填 Dataset 模型 ID，使用字段快照 CAS 保证安全重放。
 * 向量模型只做精确迁移；理解模型失效时优先对应系统默认模型，再按 _id 升序回退启用的兼容模型。
 * 未配置旧名称、或目录无兼容候选时不补理解模型 ID，保留正常的 ID-only 数据。
 */
export const backfillDatasetModelReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();
  const result = await runIncrementalModelReferenceMigration({
    context,
    stages: [
      {
        key: 'datasets',
        collectionName: MongoDataset.collection.name,
        model: MongoDataset,
        transform: (record) => {
          const result = backfillFlatModelFields({
            record,
            catalog,
            mappings: [
              {
                legacy: 'vectorModel',
                modelId: 'vectorModelId',
                requirement: { type: ModelTypeEnum.embedding }
              }
            ]
          });
          for (const mapping of [
            { legacy: 'agentModel', modelId: 'agentModelId', vision: false },
            { legacy: 'vlmModel', modelId: 'vlmModelId', vision: true }
          ]) {
            const modelId = catalog.resolveDatasetUnderstandingModelId({
              legacyModel: record[mapping.legacy],
              modelId: record[mapping.modelId],
              vision: mapping.vision
            });
            if (!modelId || String(record[mapping.modelId] ?? '') === modelId) continue;
            result.set = { ...result.set, [mapping.modelId]: modelId };
            result.snapshot = { ...result.snapshot, [mapping.legacy]: record[mapping.legacy] };
          }
          return result;
        }
      }
    ]
  });
  return { processedCount: result.processedCount };
};
