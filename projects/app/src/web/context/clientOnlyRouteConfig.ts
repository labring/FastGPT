const ssrRoutes = new Set(['/chat/share']);

/** 集中识别无需 SSR 的页面；除分享等明确需要 SSR 的页面外，其余页面默认全部为 client-only。 */
export const isClientOnlyRoute = (pathname: string) => {
  if (!pathname) return true;
  if (ssrRoutes.has(pathname)) return false;
  return true;
};
