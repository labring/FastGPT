import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataDocumentTrainingStatus } from '@fastgpt/global/core/dataset/data/utils';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';

/** 建立训练记录前统一过滤空输入和超过当前阶段上限的分块。 */
export const filterTrainingDataList = <T extends { q?: string; a?: string; imageId?: string }>({
  data,
  maxToken
}: {
  data: T[];
  maxToken: number;
}) =>
  data.filter(
    ({ q, a, imageId }) => Boolean(q || imageId) && (q?.length ?? 0) + (a?.length ?? 0) <= maxToken
  );

/** 保留各增强阶段原有长度限制，auto 超长分块直接进入普通索引。 */
export const prepareDatasetIndexTrainingChunks = ({
  data,
  indexStatus,
  agentModel,
  vlmModel,
  vlmModelConfigured = Boolean(vlmModel),
  supportImageEmbedding = false
}: {
  data: PushDataChunkType[];
  indexStatus: DatasetDataDocumentTrainingStatus;
  agentModel?: LLMModelDataType;
  vlmModel?: LLMModelDataType;
  vlmModelConfigured?: boolean;
  supportImageEmbedding?: boolean;
}): (PushDataChunkType & { indexStatus: DatasetDataDocumentTrainingStatus })[] => {
  if (indexStatus === DatasetDataIndexStageEnum.auto) {
    const maxToken = agentModel ? getLLMMaxChunkSize(agentModel) : Infinity;
    return filterTrainingDataList({ data, maxToken: Infinity }).map((item) => ({
      ...item,
      indexStatus:
        (item.q?.length ?? 0) + (item.a?.length ?? 0) > maxToken
          ? DatasetDataIndexStageEnum.index
          : indexStatus
    }));
  }

  const imageStage =
    indexStatus === DatasetDataIndexStageEnum.image ||
    indexStatus === DatasetDataIndexStageEnum.imageParse;
  if (
    imageStage &&
    !vlmModelConfigured &&
    !(indexStatus === DatasetDataIndexStageEnum.image && supportImageEmbedding)
  ) {
    throw i18nT('common:error_vlm_not_config');
  }
  const maxToken = imageStage && vlmModel ? getLLMMaxChunkSize(vlmModel) : Infinity;
  return filterTrainingDataList({ data, maxToken }).map((item) => ({ ...item, indexStatus }));
};
