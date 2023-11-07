import { ErrType } from '../errorCode';

/* dataset: 501000 */
export enum DatasetErrEnum {
  unAuthDataset = 'unAuthDataset',
  unCreateCollection = 'unCreateCollection',
  unAuthDatasetCollection = 'unAuthDatasetCollection',
  unAuthDatasetData = 'unAuthDatasetData',
  unAuthDatasetFile = 'unAuthDatasetFile'
}
const datasetErr = [
  {
    statusText: DatasetErrEnum.unAuthDataset,
    message: '无权操作该知识库'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetCollection,
    message: '无权操作该数据集'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetData,
    message: '无权操作该数据'
  },
  {
    statusText: DatasetErrEnum.unAuthDatasetFile,
    message: '无权操作该文件'
  },
  {
    statusText: DatasetErrEnum.unCreateCollection,
    message: '无权创建数据集'
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
