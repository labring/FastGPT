import { i18nT } from '../../../../web/i18n/utils';
import { ErrType } from '../errorCode';

/* dataset: 501000 */
export enum DatasetErrEnum {
  unExist = 'unExistDataset',
  unAuthDataset = 'unAuthDataset',
  unCreateCollection = 'unCreateCollection',
  unAuthDatasetCollection = 'unAuthDatasetCollection',
  unAuthDatasetData = 'unAuthDatasetData',
  unAuthDatasetFile = 'unAuthDatasetFile',
  unLinkCollection = 'unLinkCollection',
  invalidVectorModelOrQAModel = 'invalidVectorModelOrQAModel',
  notSupportSync = 'notSupportSync',
  sameApiCollection = 'sameApiCollection'
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
    message: 'core.dataset.error.unExistDataset'
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
