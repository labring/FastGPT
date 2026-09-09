import { MongoDataset } from '../schema';
import { getDatasetModelReference } from '../model';
import { getModelHandle } from '../../ai/model';
import type { ModelHandle } from '../../ai/config/handle';

/**
 * 搜索的视觉能力是可选增强：按知识库顺序选择第一个启用且支持视觉的模型。
 * 缺失、停用、类型不符和空配置均跳过，全部不可用时返回 undefined；不影响训练的严格校验。
 */
export const findFirstDatasetSearchVlmModel = (
  datasets: Parameters<typeof getDatasetModelReference>[0][],
  modelHandle: ModelHandle
) => {
  for (const dataset of datasets) {
    const model = modelHandle.findModelData(getDatasetModelReference(dataset, 'vlm'), {
      type: 'llm',
      vision: true
    });
    if (model?.isActive) return model;
  }
};
/**
 * 批量读取本次可搜索知识库的 VLM 引用，再按调用方顺序选出首个可用模型。
 * Mongo 的 $in 不保证顺序；缺失知识库跳过，不使用未授权或其他团队的知识库作为候选。
 */
export const getDatasetSearchVlmModel = async ({
  teamId,
  datasetIds,
  modelHandle
}: {
  teamId: string;
  datasetIds: string[];
  modelHandle?: ModelHandle;
}) => {
  if (datasetIds.length === 0) return;
  const datasets = await MongoDataset.find(
    { teamId, _id: { $in: datasetIds } },
    'vlmModelId vlmModel'
  ).lean();
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  return findFirstDatasetSearchVlmModel(
    datasetIds.flatMap((id) => {
      const dataset = datasetMap.get(id);
      return dataset ? [dataset] : [];
    }),
    modelHandle ?? (await getModelHandle())
  );
};
