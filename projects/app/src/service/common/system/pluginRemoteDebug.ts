/**
 * 远程调试入口 = 管理员开关 AND Plugin 服务能力。
 * 探测结果只表示服务端支持能力，不能绕过管理员显式关闭。
 */
export const resolvePluginRemoteDebug = ({
  adminEnabled,
  pluginAvailable
}: {
  adminEnabled: boolean;
  pluginAvailable: boolean;
}): boolean => adminEnabled && pluginAvailable;
