import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* team: 503000 */
export enum UserErrEnum {
  unAuthUser = 'unAuthUser',
  unAuthRole = 'unAuthRole',
  binVisitor = 'binVisitor',
  balanceNotEnough = 'balanceNotEnough',
  unAuthSso = 'unAuthSso'
}
const errList = [
  {
    statusText: UserErrEnum.unAuthUser,
    message: i18nT('common:code_error.user_error.un_auth_user')
  },
  {
    statusText: UserErrEnum.binVisitor,
    message: i18nT('common:code_error.user_error.bin_visitor')
  }, // 身份校验未通过
  {
    statusText: UserErrEnum.binVisitor,
    message: i18nT('common:code_error.user_error.bin_visitor_guest')
  }, // 游客身份
  {
    statusText: UserErrEnum.balanceNotEnough,
    message: i18nT('common:code_error.user_error.balance_not_enough')
  },
  {
    statusText: UserErrEnum.unAuthSso,
    message: i18nT('user:sso_auth_failed')
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 503000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${UserErrEnum}`>);
