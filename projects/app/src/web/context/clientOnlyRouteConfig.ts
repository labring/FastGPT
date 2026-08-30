const standaloneClientOnlyRoutes = new Set([
  '/config/plugin/marketplace',
  '/dashboard/tool/marketplace',
  '/price'
]);

const clientOnlyRouteExceptions = new Set(['/account/cancel']);

/** 集中识别无需 SSR 的页面；i18n 资源不再按路由声明。 */
export const isClientOnlyRoute = (pathname: string) => {
  if (standaloneClientOnlyRoutes.has(pathname)) return true;
  if (clientOnlyRouteExceptions.has(pathname)) return false;
  return pathname.startsWith('/account/') || pathname.startsWith('/config/');
};
