import { findAppChatLogPage } from './entity';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

/**
 * 查询日志分页行，并允许上层注入跨域来源扩展。
 * 日志域不直接依赖其他 service，保持实体访问与业务编排分层。
 */
export const getAppChatLogList = async ({
  appId,
  filter,
  sort,
  skip,
  limit,
  extendPublishSources
}: {
  appId: string;
  filter: FilterQuery<ChatSchemaType>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
  extendPublishSources: (list: AppLogsListItemType[]) => Promise<AppLogsListItemType[]>;
}) => {
  const list = await findAppChatLogPage({ appId, filter, sort, skip, limit });
  return extendPublishSources(list);
};
