import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* team: 503000 */
export enum UserErrEnum {
  notUser = 'notUser',
  userExist = 'userExist',
  unAuthRole = 'unAuthRole',
  account_psw_error = 'account_psw_error',
  unAuthSso = 'unAuthSso',
  accountCancellationPending = 'accountCancellationPending',
  invalidVerificationCode = 'invalidVerificationCode',
  sendVerificationCodeTooFrequently = 'sendVerificationCodeTooFrequently',
  verifyCodeTooFrequently = 'verifyCodeTooFrequently',
  passwordChangeAuthorizationInvalid = 'passwordChangeAuthorizationInvalid'
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
  },
  {
    statusText: UserErrEnum.accountCancellationPending,
    message: i18nT('common:code_error.account_cancellation_pending')
  },
  {
    statusText: UserErrEnum.invalidVerificationCode,
    message: i18nT('common:error.code_error'),
    httpStatus: 400
  },
  {
    statusText: UserErrEnum.sendVerificationCodeTooFrequently,
    message: i18nT('common:error.send_auth_code_too_frequently'),
    httpStatus: 429
  },
  {
    statusText: UserErrEnum.verifyCodeTooFrequently,
    message: i18nT('common:error.verify_code_too_frequently'),
    httpStatus: 429
  },
  {
    statusText: UserErrEnum.passwordChangeAuthorizationInvalid,
    message: 'Password change authorization is invalid',
    httpStatus: 403
  }
];
export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 503000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${UserErrEnum}`>);
