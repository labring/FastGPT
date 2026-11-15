import { SessionCoordinator, getSessionContextHeaders } from './sessionCoordinator';
import { SessionLifecycleSchema } from '@fastgpt/global/support/user/session/type';
import {
  SESSION_API_PATH,
  SESSION_REFRESH_REQUEST_TIMEOUT_MS
} from '@fastgpt/global/support/user/session/constants';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';
import { getWebReqUrl } from '../system/utils';
import { createSessionFetch } from './sessionFetch';

/** 独立 fetch 传输避免刷新接口递归进入 Axios / SSE 的认证恢复链。 */
export const browserSession = new SessionCoordinator({
  onContextChanged: () => {
    if (typeof window !== 'undefined') window.location.reload();
  },
  request: async (action, context) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('Session request timed out')),
      SESSION_REFRESH_REQUEST_TIMEOUT_MS
    );
    try {
      const response = await fetch(getWebReqUrl(`/api${SESSION_API_PATH}/${action}`), {
        method: action === 'refresh' ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          [FASTGPT_WEB_REQUEST_HEADER]: FASTGPT_WEB_REQUEST_VALUE,
          ...getSessionContextHeaders(context)
        },
        body: action === 'refresh' ? '{}' : undefined,
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok || body.code !== 200) throw body;
      return {
        session:
          body.data?.session === null ? null : SessionLifecycleSchema.parse(body.data?.session)
      };
    } finally {
      clearTimeout(timer);
    }
  }
});

/** 所有第一方直接 fetch / SSE 入口使用同一页内协调器。 */
const sessionFetch = createSessionFetch({ coordinator: browserSession });
export const fetchWithSession: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (
    typeof window !== 'undefined' &&
    new URL(url, window.location.href).origin !== window.location.origin
  )
    return fetch(input, init);
  return sessionFetch(input, init);
};

/** 登录与显式凭证变更响应的公开时间元数据，禁止从 Cookie 读取任何凭证。 */
export const observeSessionHeader = (
  value: unknown,
  { login = false }: { login?: boolean } = {}
) => {
  if (typeof value !== 'string') return;
  try {
    browserSession.observe(JSON.parse(value), { login });
  } catch {
    /* 展示元数据损坏不替代真实服务端鉴权。 */
  }
};

/** 公共登录入口、会话接口及显式其他凭证不进入当前浏览器 Session 的刷新链。 */
export const shouldCoordinateSession = (
  url: string,
  { headers, data }: { headers?: Record<string, string>; data?: unknown } = {}
) => {
  // 同一个发送入口也服务于登录态下的绑定通知；仅注册和找回密码绕过 Session 协调。
  if (
    /\/(?:proApi\/)?support\/user\/inform\/sendAuthCode(?:\?|$)/.test(url) &&
    data &&
    typeof data === 'object' &&
    'type' in data &&
    (data.type === 'register' || data.type === 'findPassword')
  )
    return false;
  if (
    Object.keys(headers ?? {}).some((key) =>
      ['authorization', 'token', 'rootkey'].includes(key.toLowerCase())
    )
  )
    return false;
  return !/\/(?:proApi\/)?support\/user\/account\/(?:session\/|preLogin|login[^/]*|captcha\/|register\/|password\/updateByCode)/.test(
    url
  );
};

export const isSessionLoginResponse = (url: string) =>
  /\/support\/user\/account\/(?:login[^/]*|register\/|password\/updateByCode)/.test(url);

// 页面挂起时单调时钟可能暂停，恢复前台 / 网络后重新向服务端校准，不使用后台保活定时器。
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const synchronize = () => {
    if (browserSession.hasSession && document.visibilityState === 'visible' && navigator.onLine)
      void browserSession.synchronize().catch(() => {});
  };
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('online', synchronize);
}
