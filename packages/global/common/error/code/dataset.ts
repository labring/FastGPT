import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

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
  archiveInvalidTicket = 'archiveInvalidTicket'
}
const datasetErr = [
  {
    statusText: DatasetErrEnum.sameApiCollection,
    message: i18nT('common:core.dataset.error.sameApiCollection')
  },
  {
    statusText: DatasetErrEnum.notSupportSync,
    message: i18nT('common:core.dataset.error.notSupportSync')
  },
  {
    statusText: DatasetErrEnum.unExist,
    message: i18nT('common:core.dataset.error.unExistDataset')
  },
  {
    statusText: DatasetErrEnum.unExistCollection,
    message: i18nT('common:error_collection_not_exist')
  },
  {
    statusText: DatasetErrEnum.unAuthDataset,
    message: i18nT('common:core.dataset.error.unAuthDataset')
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetCollection,
    message: i18nT('common:core.dataset.error.unAuthDatasetCollection')
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetData,
    message: i18nT('common:core.dataset.error.unAuthDatasetData')
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetFile,
    message: i18nT('common:core.dataset.error.unAuthDatasetFile')
  },
  {
    statusText: DatasetErrEnum.unCreateCollection,
    message: i18nT('common:core.dataset.error.unCreateCollection')
  },
  {
    statusText: DatasetErrEnum.unLinkCollection,
    message: i18nT('common:core.dataset.error.unLinkCollection')
  },
  {
    statusText: DatasetErrEnum.invalidVectorModelOrQAModel,
    message: i18nT('common:core.dataset.error.invalidVectorModelOrQAModel')
  },
  {
    statusText: DatasetErrEnum.canNotEditAdminPermission,
    message: i18nT('common:core.dataset.error.canNotEditAdminPermission')
  },
  {
    statusText: DatasetErrEnum.noApiServer,
    message: i18nT('common:core.dataset.error.noApiServer')
  },
  {
    statusText: DatasetErrEnum.externalChunkFailed,
    message: i18nT('dataset:chunk_error.failed')
  },
  {
    statusText: DatasetErrEnum.externalChunkInvalidResponse,
    message: i18nT('dataset:chunk_error.invalid_response')
  },
  {
    statusText: DatasetErrEnum.externalChunkNotConfigured,
    message: i18nT('dataset:chunk_error.not_configured')
  },

  // Tag errors
  {
    statusText: DatasetErrEnum.tagNameDuplicate,
    message: i18nT('common:core.dataset.error.tagNameDuplicate')
  },
  {
    statusText: DatasetErrEnum.tagNameEmpty,
    message: i18nT('common:core.dataset.error.tagNameEmpty')
  },
  {
    statusText: DatasetErrEnum.tagNotExist,
    message: i18nT('common:core.dataset.error.tagNotExist')
  },
  {
    statusText: DatasetErrEnum.tagValueInvalid,
    message: i18nT('common:core.dataset.error.tagValueInvalid')
  },
  {
    statusText: DatasetErrEnum.tagValueDatetimeInvalid,
    message: i18nT('common:core.dataset.error.tagValueDatetimeInvalid')
  },
  {
    statusText: DatasetErrEnum.arrayTagValueInvalid,
    message: i18nT('common:core.dataset.error.arrayTagValueInvalid')
  },
  {
    statusText: DatasetErrEnum.collectionPermissionDisabled,
    message: i18nT('common:core.dataset.error.collectionPermissionDisabled')
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
    message: i18nT('dataset:archive.invalid_file')
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
      ...('httpStatus' in cur ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${DatasetErrEnum}`>);
