import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getLogger, LogCategories } from '../../common/logger';
import { isImageEmbeddingModel } from '../ai/model';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

// TODO: 需要优化成批量获取权限
export const filterDatasetsByTmbId = async ({
  datasetIds,
  tmbId
}: {
  datasetIds: string[];
  tmbId: string;
}) => {
  const permissions = await Promise.all(
    datasetIds.map(async (datasetId) => {
      try {
        await authDatasetByTmbId({
          tmbId,
          datasetId,
          per: ReadPermissionVal
        });
        return true;
      } catch (error) {
        logger.warn('Dataset access denied for member', { datasetId, error });
        return false;
      }
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};

export const getDatasetImageIndexCapability = ({
  vectorModel,
  vlmModel
}: {
  vectorModel?: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
}) => {
  const availableVlmModel = vlmModel;
  const supportVlm = !!availableVlmModel;
  const supportImageEmbedding = isImageEmbeddingModel(vectorModel);

  return {
    availableVlmModel,
    supportVlm,
    supportImageEmbedding,
    supportImageIndex: supportVlm || supportImageEmbedding
  };
};

export const getDatasetImageTrainingMode = ({
  supportVlm,
  supportImageIndex,
  imageId,
  hasMarkdownImages
}: {
  supportVlm: boolean;
  supportImageIndex: boolean;
  imageId?: string;
  hasMarkdownImages: boolean;
}) => {
  if (supportVlm && imageId) return TrainingModeEnum.imageParse;
  if (supportImageIndex && hasMarkdownImages) return TrainingModeEnum.image;
  return TrainingModeEnum.chunk;
};
