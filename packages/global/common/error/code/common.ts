import { ErrType } from '../errorCode';

/* dataset: 507000 */
const startCode = 507000;
export enum CommonErrEnum {
  fileNotFound = 'fileNotFound'
}
const datasetErr = [
  {
    statusText: CommonErrEnum.fileNotFound,
    message: 'error.fileNotFound'
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
