export const AIPROXY_MEMBER_GROUP_PREFIX = 'fastgpt:tmb:';

/** 格式化成员在 AI Proxy 的分组 ID */
export const getMemberGroupId = (tmbId: string): string => `${AIPROXY_MEMBER_GROUP_PREFIX}${tmbId}`;

/** 从 FastGPT groupId 中提取 tmbId；非 FastGPT 分组返回 undefined */
export const parseTmbIdFromGroupId = (groupId: string): string | undefined => {
  return groupId.startsWith(AIPROXY_MEMBER_GROUP_PREFIX)
    ? groupId.slice(AIPROXY_MEMBER_GROUP_PREFIX.length)
    : undefined;
};
