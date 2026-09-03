import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';
import { backfillFlatModelFields } from '../4163_model_references/transforms';

/** 按固定 endId 和 _id checkpoint 增量回填 Dataset 的向量、Agent 和视觉模型 ID。 */
export const backfillDatasetModelReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();
  const result = await runIncrementalModelReferenceMigration({
    context,
    stages: [
      {
        key: 'datasets',
        collectionName: MongoDataset.collection.name,
        model: MongoDataset,
        transform: (record) =>
          backfillFlatModelFields({
            record,
            catalog,
            mappings: [
              {
                legacy: 'vectorModel',
                modelId: 'vectorModelId',
                requirement: { type: ModelTypeEnum.embedding }
              },
              {
                legacy: 'agentModel',
                modelId: 'agentModelId',
                requirement: { type: ModelTypeEnum.llm }
              },
              {
                legacy: 'vlmModel',
                modelId: 'vlmModelId',
                requirement: { type: ModelTypeEnum.llm, vision: true }
              }
            ]
          })
      }
    ]
  });
  return { processedCount: result.processedCount };
};
