import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import type {
  DatasetDataSchemaType,
  DatasetSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import { isModelConfigError } from '@fastgpt/global/common/error/model';

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
 * 获取首次训练时需要从训练任务透传给 data 层的外部索引。
 *
 * `default` 和 `imageEmbedding` 都是系统索引，由 data/dataIndex 根据当前 q/a/imageId
 * 重新生成；这里仅保留 custom/question/summary/image 等外部索引。其中 image 是 VLM
 * 生成的文本描述索引，只有当前集合仍开启图片索引且 VLM 可用时才保留。
 * 普通文本索引不读取视觉模型配置；已知配置错误只移除图片描述索引，其他异常向上抛出。
 */
export const getIndexTrainingBaseIndexes = async (trainingData: TrainingDataType) => {
  const sourceIndexes = trainingData.indexes?.length
    ? trainingData.indexes.map((index) => ({ ...index }))
    : trainingData.data?.indexes || [];
  const externalIndexes = sourceIndexes.filter(
    (index) => !isDatasetDataSystemIndexType(index.type)
  );
  if (!externalIndexes.some((index) => index.type === DatasetDataIndexTypeEnum.image)) {
    return externalIndexes;
  }

  let supportVlm = false;
  if (trainingData.collection.imageIndex) {
    const modelHandle = await getModelHandle({ teamId: String(trainingData.teamId) });
    try {
      supportVlm = !!modelHandle.getVlmModelData(
        getDatasetModelReference(trainingData.dataset, 'vlm'),
        { optional: true }
      );
    } catch (error) {
      // 视觉增强可以被跳过；配置失效时移除其旧描述索引，不能阻塞普通文本向量化。
      if (!isModelConfigError(error)) throw error;
    }
  }
  return externalIndexes.filter(
    (index) => index.type !== DatasetDataIndexTypeEnum.image || supportVlm
  );
};

/**
 * 获取首次训练最终写入的数据。q/a 使用本轮训练记录的实际值，空串允许主动清空。
 * rebuild 不使用此输入：它只从已存 data.indexes 重建向量。
 */
export const getIndexTrainingUpdateInput = async (trainingData: TrainingDataType) => {
  if (!trainingData.data) return;

  return {
    q: trainingData.q,
    a: trainingData.a,
    imageId: trainingData.data.imageId,
    indexes: await getIndexTrainingBaseIndexes(trainingData),
    imageDescMap: trainingData.imageDescMap
  };
};
