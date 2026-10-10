import type {
  ChannelDashboardPoint,
  GetChannelDashboardQuery,
  GetChannelLogDetailResponse,
  GetChannelLogsQuery,
  GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getAiproxyClientByGroupId } from './client';

/** 查询 system 或当前成员 group-channel 的调用日志。groupId 只能由服务端会话推导。 */
export const searchChannelLogs = ({
  groupId,
  ...params
}: Omit<GetChannelLogsQuery, 'channelType'> & {
  groupId?: string;
}): Promise<GetChannelLogsResponse> => getAiproxyClientByGroupId(groupId).logs.search(params);

/** 获取 system 或当前成员 group-channel 范围内的单条日志详情。 */
export const getChannelLogDetail = ({
  id,
  groupId
}: {
  id: number;
  groupId?: string;
}): Promise<GetChannelLogDetailResponse> => getAiproxyClientByGroupId(groupId).logs.detail(id);

/** 查询 system 或当前成员 group-channel 的时序监控数据。 */
export const getChannelDashboard = ({
  groupId,
  ...params
}: Omit<GetChannelDashboardQuery, 'channelType'> & {
  groupId?: string;
}): Promise<ChannelDashboardPoint[]> => getAiproxyClientByGroupId(groupId).dashboard.get(params);
