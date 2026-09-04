/**
 * 拼过滤器 localStorage key：fastgpt:filters:{teamId}[:{name}[:{resourceId}]]
 * 工作台列表只用 teamId，页面差异放 value 的 agent / tool。name 留给按资源拆桶的筛选。
 */
export const buildFilterStorageKey = ({
  name,
  teamId,
  resourceId
}: {
  teamId: string;
  name?: string;
  resourceId?: string;
}) => ['fastgpt', 'filters', teamId, name, resourceId].filter(Boolean).join(':');
