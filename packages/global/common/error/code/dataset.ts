import { i18nT } from '../../../../web/i18n/utils';
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
  // Synonym errors
  synonymFileNotExist = 'synonymFileNotExist',
  synonymFileEmpty = 'synonymFileEmpty',
  synonymFileInvalidFormat = 'synonymFileInvalidFormat',
  synonymFileNoValidData = 'synonymFileNoValidData',
  synonymFileUnsupportedFormat = 'synonymFileUnsupportedFormat',
  synonymFileParseFailed = 'synonymFileParseFailed'
}
const datasetErr = [
  {
    statusText: DatasetErrEnum.sameApiCollection,
    message: i18nT('dataset:same_api_collection')
  },
  {
    statusText: DatasetErrEnum.notSupportSync,
    message: i18nT('dataset:collection_not_support_sync')
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
    message: 'core.dataset.error.unAuthDataset'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetCollection,
    message: 'core.dataset.error.unAuthDatasetCollection'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetData,
    message: 'core.dataset.error.unAuthDatasetData'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetFile,
    message: 'core.dataset.error.unAuthDatasetFile'
  },
  {
    statusText: DatasetErrEnum.unCreateCollection,
    message: 'core.dataset.error.unCreateCollection'
  },
  {
    statusText: DatasetErrEnum.unLinkCollection,
    message: 'core.dataset.error.unLinkCollection'
  },
  {
    statusText: DatasetErrEnum.invalidVectorModelOrQAModel,
    message: 'core.dataset.error.invalidVectorModelOrQAModel'
  },
  {
    statusText: DatasetErrEnum.canNotEditAdminPermission,
    message: 'core.dataset.error.canNotEditAdminPermission'
  },
  {
    statusText: DatasetErrEnum.synonymFileNotExist,
    message: i18nT('common:core.dataset.error.synonymFileNotExist')
  },
  {
    statusText: DatasetErrEnum.synonymFileEmpty,
    message: i18nT('common:core.dataset.error.synonymFileEmpty')
  },
  {
    statusText: DatasetErrEnum.synonymFileInvalidFormat,
    message: i18nT('common:core.dataset.error.synonymFileInvalidFormat')
  },
  {
    statusText: DatasetErrEnum.synonymFileNoValidData,
    message: i18nT('common:core.dataset.error.synonymFileNoValidData')
  },
  {
    statusText: DatasetErrEnum.synonymFileUnsupportedFormat,
    message: i18nT('common:core.dataset.error.synonymFileUnsupportedFormat')
  },
  {
    statusText: DatasetErrEnum.synonymFileParseFailed,
    message: i18nT('common:core.dataset.error.synonymFileParseFailed')
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
