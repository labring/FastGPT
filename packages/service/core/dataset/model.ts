import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model.schema';

type DatasetModelFields = Pick<
  DatasetSchemaType,
  'vectorModelId' | 'vectorModel' | 'agentModelId' | 'agentModel' | 'vlmModelId' | 'vlmModel'
>;

/** 纯引用转换：稳定 ID 优先，缺少 ID 才保留历史名称；不读取缓存，也不执行模型校验。 */
export const getDatasetModelReference = (
  dataset: Partial<DatasetModelFields>,
  slot: 'embedding' | 'agent' | 'vlm'
): ModelReferenceType => {
  const keys = {
    embedding: ['vectorModelId', 'vectorModel'],
    agent: ['agentModelId', 'agentModel'],
    vlm: ['vlmModelId', 'vlmModel']
  } as const;
  const [idKey, nameKey] = keys[slot];
  const id = dataset[idKey];
  return {
    modelId: id === undefined || id === null ? undefined : String(id),
    model: dataset[nameKey]
  };
};
