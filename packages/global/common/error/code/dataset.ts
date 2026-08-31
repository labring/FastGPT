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

  // Tag errors (501013+)
  tagNameDuplicate = 'tagNameDuplicate',
  tagNameEmpty = 'tagNameEmpty',
  tagNotExist = 'tagNotExist',
  tagValueInvalid = 'tagValueInvalid',
  tagValueStringTooLong = 'tagValueStringTooLong',
  tagValueNumberOutOfRange = 'tagValueNumberOutOfRange',
  tagValueDatetimeInvalid = 'tagValueDatetimeInvalid',
  noDatasetForTagFilter = 'noDatasetForTagFilter',
  noTagsInDataset = 'noTagsInDataset',
  noPermissionForDatasetTags = 'noPermissionForDatasetTags',
  tagNotSelectedForRef = 'tagNotSelectedForRef',
  arrayTagValueInvalid = 'arrayTagValueInvalid'
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
    statusText: DatasetErrEnum.tagValueStringTooLong,
    message: i18nT('common:core.dataset.error.tagValueStringTooLong')
  },
  {
    statusText: DatasetErrEnum.tagValueNumberOutOfRange,
    message: i18nT('common:core.dataset.error.tagValueNumberOutOfRange')
  },
  {
    statusText: DatasetErrEnum.tagValueDatetimeInvalid,
    message: i18nT('common:core.dataset.error.tagValueDatetimeInvalid')
  },
  {
    statusText: DatasetErrEnum.noDatasetForTagFilter,
    message: i18nT('common:core.dataset.error.noDatasetForTagFilter')
  },
  {
    statusText: DatasetErrEnum.noTagsInDataset,
    message: i18nT('common:core.dataset.error.noTagsInDataset')
  },
  {
    statusText: DatasetErrEnum.noPermissionForDatasetTags,
    message: i18nT('common:core.dataset.error.noPermissionForDatasetTags')
  },
  {
    statusText: DatasetErrEnum.tagNotSelectedForRef,
    message: i18nT('common:core.dataset.error.tagNotSelectedForRef')
  },
  {
    statusText: DatasetErrEnum.arrayTagValueInvalid,
    message: i18nT('common:core.dataset.error.arrayTagValueInvalid')
  }
];
export default datasetErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 501000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${DatasetErrEnum}`>);
