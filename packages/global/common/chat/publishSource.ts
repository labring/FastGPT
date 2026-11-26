import { ChatSourceEnum } from '../../core/chat/constants';

/** 业务查询兼容旧分类；界面调用渠道列应直接读取 publishSource.type。 */
export const getChatPublishSourceType = ({
  publishSource,
  source
}: {
  publishSource?: { type?: string | null } | null;
  source?: string | null;
}) => publishSource?.type ?? source ?? undefined;

/** 内部入口没有发布渠道；外部入口优先使用当前名，再回退有效旧名，无名称时由展示层补 -。 */
export const getChatPublishSourceName = ({
  type,
  name,
  sourceName
}: {
  type?: string | null;
  name?: string | null;
  sourceName?: string | null;
}) => {
  if (
    type === ChatSourceEnum.online ||
    type === ChatSourceEnum.test ||
    type === ChatSourceEnum.cronJob
  ) {
    return undefined;
  }
  return name?.trim() || sourceName?.trim() || undefined;
};
