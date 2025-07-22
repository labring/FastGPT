import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* team: 503000 */
export enum UserErrEnum {
  notUser = 'notUser',
  userExist = 'userExist',
  unAuthRole = 'unAuthRole',
  account_psw_error = 'account_psw_error',
  unAuthSso = 'unAuthSso'
}
const errList = [
  {
    statusText: UserErrEnum.notUser,
    message: i18nT('common:code_error.account_not_found')
  },
  {
    statusText: UserErrEnum.userExist,
    message: i18nT('common:code_error.account_exist')
  },
  {
    statusText: UserErrEnum.account_psw_error,
    message: i18nT('common:code_error.account_error')
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
