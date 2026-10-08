import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import type {
  DatasetDataSchemaType,
  DatasetSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';

type PopulateType = {
  dataset: Pick<DatasetSchemaType, 'vectorModelId' | 'vectorModel' | 'vlmModelId' | 'vlmModel'>;
  collection: { name: string; indexPrefixTitle: boolean; imageIndex?: boolean };
  data?: {
    _id: string;
    q: string;
    a?: string;
    imageId?: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

/**
 * 获取重建时需要从训练任务透传给 data 层的外部索引。
 *
 * `default` 和 `imageEmbedding` 都是系统索引，由 data/dataIndex 根据当前 q/a/imageId
 * 重新生成；这里仅保留 custom/question/summary/image 等外部索引。其中 image 是 VLM
 * 生成的文本描述索引，只有当前集合仍开启图片索引且 VLM 可用时才保留。
 */
export const getRebuildBaseIndexes = async (trainingData: TrainingDataType) => {
  const sourceIndexes = trainingData.indexes?.length
    ? trainingData.indexes.map((index) => ({ ...index }))
    : trainingData.data?.indexes || [];
  const modelHandle = await getModelHandle();
  const { supportVlm } = getDatasetImageIndexCapability({
    vectorModel: modelHandle.getEmbeddingModelData(
      getDatasetModelReference(trainingData.dataset, 'embedding')
    ),
    vlmModel: modelHandle.getVlmModelData(getDatasetModelReference(trainingData.dataset, 'vlm'), {
      optional: true
    })
  });

  return sourceIndexes.filter((index) => {
    if (isDatasetDataSystemIndexType(index.type)) {
      return false;
    }
    if (
      index.type === DatasetDataIndexTypeEnum.image &&
      (!supportVlm || !trainingData.collection.imageIndex)
    ) {
      return false;
    }
    return true;
  });
};

/**
 * 获取完整 rebuild 最终写入的数据，优先使用本轮图片和自动索引训练产物。
 * training 的 q/a 默认值都是空字符串，不代表本轮生成了空内容；空值保留 data 原文，
 * 非空训练内容仍用于图片解析或手动重试。主动清空正文需走 data 更新接口。
 */
export const getRebuildUpdateInput = async (trainingData: TrainingDataType) => {
  if (!trainingData.data) return;

  return {
    q: trainingData.q ? trainingData.q : trainingData.data.q,
    a: trainingData.a ? trainingData.a : trainingData.data.a,
    imageId: trainingData.data.imageId,
    indexes: await getRebuildBaseIndexes(trainingData),
    imageDescMap: trainingData.imageDescMap
  };
};
