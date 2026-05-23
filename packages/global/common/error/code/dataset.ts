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
  // Data validation errors
  datasetIdMismatch = 'datasetIdMismatch',
  // Synonym errors
  synonymFileNotExist = 'synonymFileNotExist',
  synonymFileEmpty = 'synonymFileEmpty',
  synonymFileInvalidFormat = 'synonymFileInvalidFormat',
  synonymFileNoValidData = 'synonymFileNoValidData',
  synonymFileUnsupportedFormat = 'synonymFileUnsupportedFormat',
  synonymFileParseFailed = 'synonymFileParseFailed',
  synonymTermDuplicate = 'synonymTermDuplicate',
  datasetTrainingInProgress = 'datasetTrainingInProgress',
  // Collection name validation errors
  collectionNameDuplicate = 'collectionNameDuplicate',
  collectionNameMissingExtension = 'collectionNameMissingExtension',
  collectionNameExtensionMismatch = 'collectionNameExtensionMismatch',
  // Template import errors
  templateImportModeNotFound = 'templateImportModeNotFound',
  // File upload errors
  fileContentDuplicate = 'fileContentDuplicate',
  // Image dataset errors
  imageDatasetRequiresVlmModel = 'imageDatasetRequiresVlmModel',
  imageDatasetRequiresVlmModelOrCustomParse = 'imageDatasetRequiresVlmModelOrCustomParse'
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
    statusText: DatasetErrEnum.datasetIdMismatch,
    message: i18nT('common:core.dataset.error.datasetIdMismatch')
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
  },
  {
    statusText: DatasetErrEnum.synonymTermDuplicate,
    message: i18nT('common:core.dataset.error.synonymTermDuplicate')
  },
  {
    statusText: DatasetErrEnum.datasetTrainingInProgress,
    message: i18nT('common:core.dataset.error.datasetTrainingInProgress')
  },
  {
    statusText: DatasetErrEnum.collectionNameDuplicate,
    message: i18nT('common:core.dataset.error.collectionNameDuplicate')
  },
  {
    statusText: DatasetErrEnum.collectionNameMissingExtension,
    message: i18nT('common:core.dataset.error.collectionNameMissingExtension')
  },
  {
    statusText: DatasetErrEnum.collectionNameExtensionMismatch,
    message: i18nT('common:core.dataset.error.collectionNameExtensionMismatch')
  },
  {
    statusText: DatasetErrEnum.templateImportModeNotFound,
    message: i18nT('dataset:template_import_mode_not_found')
  },
  {
    statusText: DatasetErrEnum.fileContentDuplicate,
    message: i18nT('common:core.dataset.error.fileContentDuplicate')
  },
  {
    statusText: DatasetErrEnum.imageDatasetRequiresVlmModel,
    message: i18nT('file:Image_dataset_requires_VLM_model_to_be_configured')
  },
  {
    statusText: DatasetErrEnum.imageDatasetRequiresVlmModelOrCustomParse,
    message: i18nT('file:custom_parse_failed_configure_vlm')
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
