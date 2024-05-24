import { CollectionWithDatasetType, DatasetCollectionSchemaType } from '../type';

export const getCollectionSourceData = (
  collection?: CollectionWithDatasetType | DatasetCollectionSchemaType
) => {
  return {
    sourceId:
      collection?.fileId ||
      collection?.rawLink ||
      collection?.externalFileId ||
      collection?.externalFileUrl,
    sourceName: collection?.name || ''
  };
};
