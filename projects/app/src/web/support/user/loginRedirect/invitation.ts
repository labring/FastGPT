const INVITATION_QUERY_KEYS = ['invitelinkid', 'inviteLinkId'] as const;

/** 从登录回跳地址中兼容解析历史和新邀请参数。 */
export const getInviteLinkIdFromRoute = (route: string) => {
  try {
    const url = new URL(route, 'http://fastgpt.local');
    return INVITATION_QUERY_KEYS.map((key) => url.searchParams.get(key)).find(Boolean) || '';
  } catch {
    return '';
  }
};

/** 仅清除邀请参数，保留其他 query、路径和 hash。 */
export const clearInviteLinkFromRoute = (route: string) => {
  const url = new URL(route, 'http://fastgpt.local');
  INVITATION_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}`;
};
