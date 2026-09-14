import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
import { userImportErrorKeys } from '../../../support/user/import/constants';
/* team: 503000 */
export enum UserErrEnum {
  notUser = 'notUser',
  userExist = 'userExist',
  unAuthRole = 'unAuthRole',
  account_psw_error = 'account_psw_error',
  unAuthSso = 'unAuthSso',
  invalidVerificationCode = 'invalidVerificationCode',
  sendVerificationCodeTooFrequently = 'sendVerificationCodeTooFrequently',
  verifyCodeTooFrequently = 'verifyCodeTooFrequently',
  invalidAccount = 'invalidAccount',
  accountCancellationPending = 'accountCancellationPending',
  registrationMethodNotSupported = 'registrationMethodNotSupported'
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
    statusText: UserErrEnum.invalidAccount,
    message: i18nT('common:code_error.invalid_account')
  },
  {
    statusText: UserErrEnum.accountCancellationPending,
    message: i18nT('common:code_error.account_cancellation_pending'),
    httpStatus: 403
  },
  {
    statusText: UserErrEnum.registrationMethodNotSupported,
    message: i18nT('common:error.registration_method_not_supported'),
    httpStatus: 403
  },
  ...(
    [
      ['USER_IMPORT_NOT_ALLOWED_IN_SYNC_MODE', 400],
      ['USER_IMPORT_ALREADY_RUNNING', 409],
      ['IMPORT_ERROR_FILE_NOT_FOUND', 404],
      ['USER_IMPORT_ONLY_XLSX', 400],
      ['USER_IMPORT_INVALID_XLSX', 400],
      ['USER_IMPORT_TEAM_MODE_LOCKED', 409]
    ] as const
  ).map(([statusText, httpStatus]) => ({
    statusText,
    message: userImportErrorKeys[statusText],
    httpStatus
  }))
];
export default errList.reduce(
  (acc, cur, index) => {
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
  },
  {} as ErrType<`${UserErrEnum}` | (typeof errList)[number]['statusText']>
);
