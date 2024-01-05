import { ErrType } from '../errorCode';

/* dataset: 501000 */
export enum DatasetErrEnum {
  unAuthDataset = 'unAuthDataset',
  unCreateCollection = 'unCreateCollection',
  unAuthDatasetCollection = 'unAuthDatasetCollection',
  unAuthDatasetData = 'unAuthDatasetData',
  unAuthDatasetFile = 'unAuthDatasetFile',

  unLinkCollection = 'unLinkCollection'
}
const datasetErr = [
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
