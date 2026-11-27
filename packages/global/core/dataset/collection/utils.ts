import { DatasetCollectionTypeEnum } from '../constants';
import { type DatasetCollectionSchemaType } from '../type';

export const getCollectionSourceData = (
  collection?: Pick<
    DatasetCollectionSchemaType,
    'fileId' | 'rawLink' | 'externalFileId' | 'externalFileUrl' | 'apiFileId' | 'name'
  >
) => {
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

/** 缺省（undefined）视为 true，以兼容存量 API 知识库集合；仅显式 false 停止拉取新增直属子级。 */
export const isCollectionSyncChildrenEnabled = (collection?: { syncChildren?: boolean }) =>
  collection?.syncChildren !== false;
