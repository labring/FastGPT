import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 506000 */
export enum OpenApiErrEnum {
  unExist = 'openapiUnExist',
  unAuth = 'openapiUnAuth',
  exceedLimit = 'openapiExceedLimit'
}

const errList: Array<{
  statusText: OpenApiErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: OpenApiErrEnum.unExist,
    message: i18nT('common:code_error.openapi_error.api_key_not_exist'),
    httpStatus: 404
  },
  {
    statusText: OpenApiErrEnum.unAuth,
    message: i18nT('common:code_error.openapi_error.un_auth'),
    httpStatus: 403
  },
  {
    statusText: OpenApiErrEnum.exceedLimit,
    message: i18nT('common:code_error.openapi_error.exceed_limit'),
    httpStatus: 403
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 506000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${OpenApiErrEnum}`>);
