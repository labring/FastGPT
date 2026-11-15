/** 登录生命周期默认值；服务端仍会校验会话边界，客户端时间不构成授权依据。 */
export const SESSION_ACCESS_TTL_SECONDS = 15 * 60;
export const SESSION_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_PREFRESH_MS = 60_000;
export const SESSION_REFRESH_REPLAY_MS = 60_000;
export const SESSION_REFRESH_REQUEST_TIMEOUT_MS = 10_000;
export const SESSION_REFRESH_COOKIE_NAME = 'fastgpt_refresh_token';
export const SESSION_SELECTOR_COOKIE_NAME = 'fastgpt_session';
export const SESSION_API_PATH = '/support/user/account/session';
export const SESSION_CONTEXT_HEADER = 'x-fastgpt-session-context';
