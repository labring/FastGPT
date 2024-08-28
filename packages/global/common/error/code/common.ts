import { ErrType } from '../errorCode';

/* dataset: 507000 */
const startCode = 507000;
export enum CommonErrEnum {
  fileNotFound = 'fileNotFound',
  unAuthFile = 'unAuthFile',
  missingParams = 'missingParams',
  inheritPermissionError = 'inheritPermissionError'
}
const datasetErr = [
  {
    statusText: CommonErrEnum.fileNotFound,
    message: 'error.fileNotFound'
  },
  {
    statusText: CommonErrEnum.unAuthFile,
    message: 'error.unAuthFile'
  },
  {
    statusText: CommonErrEnum.missingParams,
    message: 'error.missingParams'
  },
  {
    statusText: CommonErrEnum.inheritPermissionError,
    message: 'error.inheritPermissionError'
  }
];
export default datasetErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: startCode + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${CommonErrEnum}`>);
