import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

/* dataset: 507000 */
const startCode = 507000;
export enum CommonErrEnum {
  invalidParams = 'invalidParams',
  invalidResource = 'invalidResource',
  fileNotFound = 'fileNotFound',
  unAuthFile = 'unAuthFile',
  missingParams = 'missingParams',
  inheritPermissionError = 'inheritPermissionError'
}
const datasetErr = [
  {
    statusText: CommonErrEnum.invalidParams,
    message: i18nT('common:error.invalid_params')
  },
  {
    statusText: CommonErrEnum.invalidResource,
    message: i18nT('common:error_invalid_resource')
  },
  {
    statusText: CommonErrEnum.fileNotFound,
    message: i18nT('common:error.fileNotFound')
  },
  {
    statusText: CommonErrEnum.unAuthFile,
    message: i18nT('common:error.unAuthFile')
  },
  {
    statusText: CommonErrEnum.missingParams,
    message: i18nT('common:error.missingParams')
  },
  {
    statusText: CommonErrEnum.inheritPermissionError,
    message: i18nT('common:error.inheritPermissionError')
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
