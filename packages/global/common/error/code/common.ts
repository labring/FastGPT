import { i18nT } from '../../../../web/i18n/utils';
import { ErrType } from '../errorCode';

/* dataset: 507000 */
const startCode = 507000;
export enum CommonErrEnum {
  methodNotAllowed = 'methodNotAllowed',
  systemError = 'systemError',
  unauthorized = 'unauthorized',
  invalidParams = 'invalidParams',
  invalidResource = 'invalidResource',
  fileNotFound = 'fileNotFound',
  unAuthFile = 'unAuthFile',
  missingParams = 'missingParams',
  inheritPermissionError = 'inheritPermissionError'
}
const datasetErr = [
  {
    statusText: CommonErrEnum.fileNotFound,
    message: i18nT('common:error.invalid_params')
  },
  {
    statusText: CommonErrEnum.invalidResource,
    message: i18nT('common:error_invalid_resource')
  },
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
  },
  {
    statusText: CommonErrEnum.methodNotAllowed,
    message: i18nT('common:code_error.error_message.405')
  },
  {
    statusText: CommonErrEnum.systemError,
    message: i18nT('common:code_error.error_message.500')
  },
  {
    statusText: CommonErrEnum.unauthorized,
    message: i18nT('common:code_error.error_message.403')
  },
  {
    statusText: CommonErrEnum.invalidParams,
    message: i18nT('common:code_error.error_message.422')
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
