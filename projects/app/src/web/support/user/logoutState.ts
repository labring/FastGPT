let logoutInProgress = false;
let pendingLogoutRequest: Promise<unknown> | undefined;

/** 标记客户端已进入主动登出流程，后续并发鉴权失败只负责收敛，不再重复提示或跳转。 */
export const beginLogout = () => {
  logoutInProgress = true;
};

/** 登录成功后结束登出保护，使后续真实的会话失效仍按正常鉴权错误处理。 */
export const resetLogoutState = () => {
  logoutInProgress = false;
  pendingLogoutRequest = undefined;
};

/** 判断当前鉴权错误是否发生在主动登出过程中。 */
export const isLogoutInProgress = () => logoutInProgress;

/** 返回正在清除 Cookie 的退出请求，供并发退出复用及初始化等待；完成后不再保留。 */
export const getPendingLogoutRequest = () => pendingLogoutRequest;

/** 登记退出请求；失败也结束等待，迟到的旧请求不能清除新登录后登记的请求。 */
export const setPendingLogoutRequest = (request: Promise<unknown>) => {
  pendingLogoutRequest = request;
  const clearPendingRequest = () => {
    if (pendingLogoutRequest === request) pendingLogoutRequest = undefined;
  };
  void request.then(clearPendingRequest, clearPendingRequest);
};
