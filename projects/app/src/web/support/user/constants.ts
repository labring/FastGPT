// 鉴权门禁和配置初始化共用匿名入口，避免公共页面等待不会执行的用户初始化。
export const unAuthPagePaths = new Set([
  '/',
  '/login',
  '/login/provider',
  '/login/fastlogin',
  '/login/sso',
  '/appStore',
  '/chat',
  '/chat/share',
  '/tools/price',
  '/price',
  // API 文档不挂载 Layout/Auth，同样需要立即初始化公共配置。
  '/apidoc/devapi',
  '/apidoc/systemopenapi'
]);
