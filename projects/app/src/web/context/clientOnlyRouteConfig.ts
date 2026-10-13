// Both chat entry points read app-specific playground configuration on the server.
// Keep them SSR-enabled; pages without an equivalent SSR dependency remain client-only.
const ssrRoutes = new Set(['/chat', '/chat/share']);

/** 集中识别无需 SSR 的页面；依赖服务端配置的聊天页面保留 SSR，其余页面默认 client-only。 */
export const isClientOnlyRoute = (pathname: string) => {
  if (!pathname) return true;
  if (ssrRoutes.has(pathname)) return false;
  return true;
};
