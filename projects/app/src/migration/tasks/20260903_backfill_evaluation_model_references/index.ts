import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import type { SystemMigrationContext } from '@/migration/registry';
import { runIncrementalModelReferenceMigration } from '../4163_model_references/incremental';
import { loadModelCatalog } from '../4163_model_references/modelCatalog';
import { backfillFlatModelFields } from '../4163_model_references/transforms';

/** 按固定 endId 和 _id checkpoint 增量回填 Evaluation 使用的 LLM 模型 ID。 */
export const backfillEvaluationModelReferences = async (context: SystemMigrationContext) => {
  const catalog = await loadModelCatalog();
  const result = await runIncrementalModelReferenceMigration({
    context,
    stages: [
      {
        key: 'evaluations',
        collectionName: MongoEvaluation.collection.name,
        model: MongoEvaluation,
        transform: (record) =>
          backfillFlatModelFields({
            record,
            catalog,
            mappings: [
              {
                legacy: 'evalModel',
                modelId: 'evalModelId',
                requirement: { type: ModelTypeEnum.llm }
              }
            ]
          })
      }
    ]
  });
  return { processedCount: result.processedCount };
};
