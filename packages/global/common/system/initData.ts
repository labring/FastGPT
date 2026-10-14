/** 按实际路由选择匿名初始化配置类别；未知页面仅获得公共展示字段。 */
export const getInitDataPage = (pathname?: string) => {
  if (pathname === '/login' || pathname === '/login/sso') return 'login';
  if (pathname === '/price') return 'price';
  if (pathname === '/chat/share') return 'share';
  if (pathname === '/chat') return 'chat';
  return 'base';
};
