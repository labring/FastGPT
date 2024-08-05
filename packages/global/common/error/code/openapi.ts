import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 506000 */
export enum OpenApiErrEnum {
  unExist = 'openapiUnExist',
  unAuth = 'openapiUnAuth',
  exceedLimit = 'openapiExceedLimit'
}

const errList = [
  {
    statusText: OpenApiErrEnum.unExist,
    message: i18nT('common:code_error.openapi_error.api_key_not_exist')
  },
  {
    statusText: OpenApiErrEnum.unAuth,
    message: i18nT('common:code_error.openapi_error.un_auth')
  },
  {
    statusText: OpenApiErrEnum.exceedLimit,
    message: i18nT('common:code_error.openapi_error.exceed_limit')
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 506000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${OpenApiErrEnum}`>);
