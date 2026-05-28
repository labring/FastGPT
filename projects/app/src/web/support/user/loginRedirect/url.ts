import { safeEncodeURIComponent } from '@/web/common/utils/uri';
import { getCurrentAuthTmbId } from '../currentAuthTmbId';

export const LAST_TMB_ID_QUERY_KEY = 'lastTmbId';

/**
 * 构造鉴权失败后的登录页地址。
 *
 * lastRoute 和 lastTmbId 都必须在跳登录时写入 query：lastRoute 记录要回跳的页面，
 * lastTmbId 记录当前标签页触发 403 前的团队身份。lastTmbId 不能只依赖 localStorage，
 * 因为其他标签页切换团队会改写全局值，导致当前标签页登录后误判为同一团队。
 */
export const getAuthLoginRedirectPath = ({
  lastRoute,
  lastTmbId = getCurrentAuthTmbId()
}: {
  lastRoute: string;
  lastTmbId?: string;
}) => {
  const query = [`lastRoute=${safeEncodeURIComponent(lastRoute)}`];

  if (lastTmbId) {
    query.push(`${LAST_TMB_ID_QUERY_KEY}=${safeEncodeURIComponent(lastTmbId)}`);
  }

  return `/login?${query.join('&')}`;
};
