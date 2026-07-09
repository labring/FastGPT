/**
 * 归一化工具卡片展示标签，过滤掉异步字典未命中或脏数据产生的空标签。
 */
export const normalizeToolCardTags = (tags?: string[] | null) =>
  tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
