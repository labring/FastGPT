import { i18nT } from '../../i18n/utils';

export enum SessionErrEnum {
  accessExpired = 'session_access_expired',
  accessMissing = 'session_access_missing',
  accessInvalid = 'session_access_invalid',
  revoked = 'session_revoked',
  refreshExpired = 'session_refresh_expired',
  refreshInvalid = 'session_refresh_invalid',
  refreshReused = 'session_refresh_reused',
  contextChanged = 'session_context_changed',
  csrfInvalid = 'session_csrf_invalid',
  methodNotAllowed = 'session_method_not_allowed'
}

/** 使用稳定机器错误码区分可恢复 Access 失效和终止登录，保持统一响应 envelope。 */
export default Object.fromEntries(
  Object.values(SessionErrEnum).map((statusText) => [
    statusText,
    {
      code:
        statusText === SessionErrEnum.methodNotAllowed
          ? 405
          : statusText === SessionErrEnum.csrfInvalid
            ? 403
            : statusText === SessionErrEnum.contextChanged
              ? 409
              : 401,
      httpStatus:
        statusText === SessionErrEnum.methodNotAllowed
          ? 405
          : statusText === SessionErrEnum.csrfInvalid
            ? 403
            : statusText === SessionErrEnum.contextChanged
              ? 409
              : 401,
      statusText,
      message: i18nT('common:unauth_token'),
      data: null
    }
  ])
);
