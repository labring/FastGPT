import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '../constants';
import { DatasetCollectionSchemaType } from '../type';

export const getCollectionSourceData = (collection?: DatasetCollectionSchemaType) => {
  return {
    sourceId:
      collection?.fileId ||
      collection?.rawLink ||
      collection?.externalFileId ||
      collection?.externalFileUrl ||
      collection?.apiFileId,
    sourceName: collection?.name || ''
  };
};

export const checkCollectionIsFolder = (type: DatasetCollectionTypeEnum) => {
  return type === DatasetCollectionTypeEnum.folder || type === DatasetCollectionTypeEnum.virtual;
};

export const getTrainingModeByCollection = (collection: {
  trainingType: DatasetCollectionSchemaType['trainingType'];
  autoIndexes?: DatasetCollectionSchemaType['autoIndexes'];
  imageParse?: DatasetCollectionSchemaType['imageParse'];
}) => {
  if (collection.trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    return TrainingModeEnum.qa;
  }
  if (collection.autoIndexes) {
    return TrainingModeEnum.auto;
  }
  if (collection.imageParse) {
    return TrainingModeEnum.image;
  }
  return TrainingModeEnum.chunk;
};
