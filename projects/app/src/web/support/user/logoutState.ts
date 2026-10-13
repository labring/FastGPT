let logoutInProgress = false;

/** 标记客户端已进入主动登出流程，后续并发鉴权失败只负责收敛，不再重复提示或跳转。 */
export const beginLogout = () => {
  logoutInProgress = true;
};

/** 登录成功后结束登出保护，使后续真实的会话失效仍按正常鉴权错误处理。 */
export const resetLogoutState = () => {
  logoutInProgress = false;
};

/** 判断当前鉴权错误是否发生在主动登出过程中。 */
export const isLogoutInProgress = () => logoutInProgress;
