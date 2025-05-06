import { DatasetCollectionTypeEnum } from '../constants';
import { type DatasetCollectionSchemaType } from '../type';

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

export const collectionCanSync = (type: DatasetCollectionTypeEnum) => {
  return [DatasetCollectionTypeEnum.link, DatasetCollectionTypeEnum.apiFile].includes(type);
};
