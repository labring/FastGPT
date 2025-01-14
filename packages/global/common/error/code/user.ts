import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* team: 503000 */
export enum UserErrEnum {
  unAuthRole = 'unAuthRole',
  account_psw_error = 'account_psw_error',
  balanceNotEnough = 'balanceNotEnough',
  unAuthSso = 'unAuthSso'
}
const errList = [
  {
    statusText: UserErrEnum.account_psw_error,
    message: i18nT('common:code_error.account_error')
  },
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
