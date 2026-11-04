/** 业务查询兼容旧分类；界面调用渠道列应直接读取 publishSource.type。 */
export const getChatPublishSourceType = ({
  publishSource,
  source
}: {
  publishSource?: { type?: string | null } | null;
  source?: string | null;
}) => publishSource?.type ?? source ?? undefined;

/** 当前有效名称优先，历史名称仅作兼容；统一展示兜底由客户端负责。 */
export const getChatPublishSourceName = ({
  name,
  sourceName
}: {
  name?: string | null;
  sourceName?: string | null;
}) => name?.trim() || sourceName?.trim() || undefined;
