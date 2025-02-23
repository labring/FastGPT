import { DatasetCollectionTypeEnum } from '../constants';
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
