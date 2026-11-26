import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 505000 */
export enum OutLinkErrEnum {
  unExist = 'outlinkUnExist',
  unAuthLink = 'unAuthLink',
  linkUnInvalid = 'linkUnInvalid',
  unAuthUser = 'unAuthUser',
  cannotHideBrand = 'outlinkCannotHideBrand'
}

const errList: Array<{
  code?: number;
  statusText: OutLinkErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: OutLinkErrEnum.unExist,
    message: i18nT('common:code_error.outlink_error.link_not_exist'),
    httpStatus: 404
  },
  {
    statusText: OutLinkErrEnum.unAuthLink,
    message: i18nT('common:code_error.outlink_error.invalid_link'),
    httpStatus: 403
  },
  {
    code: 501,
    statusText: OutLinkErrEnum.linkUnInvalid,
    message: i18nT('common:code_error.outlink_error.invalid_link'), // 使用相同的错误消息
    httpStatus: 403
  },
  {
    statusText: OutLinkErrEnum.unAuthUser,
    message: i18nT('common:code_error.outlink_error.un_auth_user'),
    httpStatus: 401
  },
  {
    statusText: OutLinkErrEnum.cannotHideBrand,
    message: i18nT('common:share_brand_requires_plan'),
    httpStatus: 403
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: cur?.code ?? 505000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${OutLinkErrEnum}`>);
