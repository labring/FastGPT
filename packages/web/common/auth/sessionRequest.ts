import {
  OutLinkChatAuthSchema,
  parseOutLinkChatAuthInput
} from '@fastgpt/global/support/permission/chat';

/** 公共登录入口、会话接口及显式其他凭证不进入当前浏览器 Session 的刷新链。 */
export const shouldCoordinateSession = (
  url: string,
  {
    headers,
    data,
    origin
  }: { headers?: Record<string, string>; data?: unknown; origin?: string } = {}
) => {
  /** 分享凭证选择独立鉴权通道；这里只决定客户端续约策略，实际授权仍由服务端校验。 */
  const hasOutLinkAuth = (data: unknown) => {
    if (!data || typeof data !== 'object' || !('outLinkAuthData' in data)) return false;
    return OutLinkChatAuthSchema.safeParse(parseOutLinkChatAuthInput(data.outLinkAuthData)).success;
  };

  if (hasOutLinkAuth(data)) return false;
  try {
    const target = new URL(url, origin ?? 'http://fastgpt.local');
    // 第三方公开请求不属于 FastGPT 登录，不能因本页退出或续约失败被阻止。
    if (origin && target.origin !== new URL(origin).origin) return false;
    const query = target.searchParams.get('outLinkAuthData');
    if (hasOutLinkAuth({ outLinkAuthData: query })) return false;
  } catch {
    /* 非法 URL 交给传输层处理，不能因此免除 Session 协调。 */
  }
  // 公共启动配置决定登录表单能否显示，退出后的初始化和网络恢复重试也必须可以发送。
  if (/\/(?:proApi\/)?common\/system\/getInitData(?:\?|$)/.test(url)) return false;
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
