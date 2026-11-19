import { i18nT } from '../../i18n/utils';
import { type ErrorHttpStatus, type ErrType } from '../errorCode';

/* dataset: 501000 */
export enum DatasetErrEnum {
  unExist = 'unExistDataset',
  unExistCollection = 'unExistCollection',
  unAuthDataset = 'unAuthDataset',
  unCreateCollection = 'unCreateCollection',
  unAuthDatasetCollection = 'unAuthDatasetCollection',
  unAuthDatasetData = 'unAuthDatasetData',
  unAuthDatasetFile = 'unAuthDatasetFile',
  unLinkCollection = 'unLinkCollection',
  invalidVectorModelOrQAModel = 'invalidVectorModelOrQAModel',
  notSupportSync = 'notSupportSync',
  sameApiCollection = 'sameApiCollection',
  noApiServer = 'noApiServer',
  canNotEditAdminPermission = 'canNotEditAdminPermission',
  externalChunkFailed = 'externalChunkFailed',
  externalChunkInvalidResponse = 'externalChunkInvalidResponse',
  externalChunkNotConfigured = 'externalChunkNotConfigured',
  dataNotIndexed = 'dataNotIndexed',

  // Tag errors (501013+)
  tagNameDuplicate = 'tagNameDuplicate',
  tagNameEmpty = 'tagNameEmpty',
  tagNotExist = 'tagNotExist',
  tagValueInvalid = 'tagValueInvalid',
  tagValueDatetimeInvalid = 'tagValueDatetimeInvalid',
  arrayTagValueInvalid = 'arrayTagValueInvalid',

  // Collection 级权限（501026+）
  collectionPermissionDisabled = 'collectionPermissionDisabled',

  archiveNoDownloadableFile = 'archiveNoDownloadableFile',
  archiveLimitExceeded = 'archiveLimitExceeded',
  archiveMemberBusy = 'archiveMemberBusy',
  archiveUnavailable = 'archiveUnavailable',
  archiveInvalidFile = 'archiveInvalidFile',
  archiveUnsupportedDataset = 'archiveUnsupportedDataset',
  archiveInvalidTicket = 'archiveInvalidTicket',
  exportFolderNotSupported = 'exportFolderNotSupported'
}
const datasetErr: Array<{
  statusText: DatasetErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: DatasetErrEnum.sameApiCollection,
    message: i18nT('common:core.dataset.error.sameApiCollection'),
    httpStatus: 409
  },
  {
    statusText: DatasetErrEnum.notSupportSync,
    message: i18nT('common:core.dataset.error.notSupportSync'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.unExist,
    message: i18nT('common:core.dataset.error.unExistDataset'),
    httpStatus: 404
  },
  {
    statusText: DatasetErrEnum.unExistCollection,
    message: i18nT('common:error_collection_not_exist'),
    httpStatus: 404
  },
  {
    statusText: DatasetErrEnum.unAuthDataset,
    message: i18nT('common:core.dataset.error.unAuthDataset'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetCollection,
    message: i18nT('common:core.dataset.error.unAuthDatasetCollection'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetData,
    message: i18nT('common:core.dataset.error.unAuthDatasetData'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetFile,
    message: i18nT('common:core.dataset.error.unAuthDatasetFile'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.unCreateCollection,
    message: i18nT('common:core.dataset.error.unCreateCollection'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.unLinkCollection,
    message: i18nT('common:core.dataset.error.unLinkCollection'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.invalidVectorModelOrQAModel,
    message: i18nT('common:core.dataset.error.invalidVectorModelOrQAModel'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.canNotEditAdminPermission,
    message: i18nT('common:core.dataset.error.canNotEditAdminPermission'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.noApiServer,
    message: i18nT('common:core.dataset.error.noApiServer'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.externalChunkFailed,
    message: i18nT('dataset:chunk_error.failed'),
    httpStatus: 502
  },
  {
    statusText: DatasetErrEnum.externalChunkInvalidResponse,
    message: i18nT('dataset:chunk_error.invalid_response'),
    httpStatus: 502
  },
  {
    statusText: DatasetErrEnum.externalChunkNotConfigured,
    message: i18nT('dataset:chunk_error.not_configured'),
    // 由实例侧环境变量 SANGFOR_CHUNK_URL 缺失触发，属于服务端配置不可用而非客户端入参错误。
    httpStatus: 503
  },
  {
    statusText: DatasetErrEnum.dataNotIndexed,
    message: i18nT('common:core.dataset.error.dataNotIndexed'),
    httpStatus: 409
  },

  // Tag errors
  {
    statusText: DatasetErrEnum.tagNameDuplicate,
    message: i18nT('common:core.dataset.error.tagNameDuplicate'),
    httpStatus: 409
  },
  {
    statusText: DatasetErrEnum.tagNameEmpty,
    message: i18nT('common:core.dataset.error.tagNameEmpty'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.tagNotExist,
    message: i18nT('common:core.dataset.error.tagNotExist'),
    httpStatus: 404
  },
  {
    statusText: DatasetErrEnum.tagValueInvalid,
    message: i18nT('common:core.dataset.error.tagValueInvalid'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.tagValueDatetimeInvalid,
    message: i18nT('common:core.dataset.error.tagValueDatetimeInvalid'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.arrayTagValueInvalid,
    message: i18nT('common:core.dataset.error.arrayTagValueInvalid'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.collectionPermissionDisabled,
    message: i18nT('common:core.dataset.error.collectionPermissionDisabled'),
    httpStatus: 403
  },
  {
    statusText: DatasetErrEnum.archiveNoDownloadableFile,
    message: i18nT('dataset:archive.no_downloadable_file'),
    httpStatus: 422
  },
  {
    statusText: DatasetErrEnum.archiveLimitExceeded,
    message: i18nT('dataset:archive.limit_exceeded'),
    httpStatus: 413
  },
  {
    statusText: DatasetErrEnum.archiveMemberBusy,
    message: i18nT('dataset:archive.member_busy'),
    httpStatus: 409
  },
  {
    statusText: DatasetErrEnum.archiveUnavailable,
    message: i18nT('dataset:archive.unavailable'),
    httpStatus: 503
  },
  {
    statusText: DatasetErrEnum.archiveInvalidFile,
    message: i18nT('dataset:archive.invalid_file'),
    httpStatus: 400
  },
  {
    statusText: DatasetErrEnum.archiveUnsupportedDataset,
    message: i18nT('dataset:archive.unsupported_dataset'),
    httpStatus: 422
  },
  {
    statusText: DatasetErrEnum.archiveInvalidTicket,
    message: i18nT('dataset:archive.invalid_ticket'),
    httpStatus: 410
  },
  {
    statusText: DatasetErrEnum.exportFolderNotSupported,
    message: i18nT('common:core.dataset.error.exportFolderNotSupported'),
    httpStatus: 400
  }
];
export default datasetErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 501000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${DatasetErrEnum}`>);
