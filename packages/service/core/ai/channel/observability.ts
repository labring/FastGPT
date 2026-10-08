import type {
  ChannelDashboardPoint,
  GetChannelDashboardQuery,
  GetChannelLogDetailResponse,
  GetChannelLogsQuery,
  GetChannelLogsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';

/** 查询 system 或当前成员 group-channel 的调用日志。groupId 只能由服务端会话推导。 */
export const searchChannelLogs = ({
  groupId,
  ...params
}: Omit<GetChannelLogsQuery, 'channelType'> & {
  groupId?: string;
}): Promise<GetChannelLogsResponse> =>
  groupId
    ? aiProxyClient.group(groupId).logs.search(params)
    : aiProxyClient.system.logs.search(params);

/** 获取 system 或当前成员 group-channel 范围内的单条日志详情。 */
export const getChannelLogDetail = ({
  id,
  groupId
}: {
  id: number;
  groupId?: string;
}): Promise<GetChannelLogDetailResponse> =>
  groupId ? aiProxyClient.group(groupId).logs.detail(id) : aiProxyClient.system.logs.detail(id);

/** 查询 system 或当前成员 group-channel 的时序监控数据。 */
export const getChannelDashboard = ({
  groupId,
  ...params
}: Omit<GetChannelDashboardQuery, 'channelType'> & {
  groupId?: string;
}): Promise<ChannelDashboardPoint[]> =>
  groupId
    ? aiProxyClient.group(groupId).dashboard.get(params)
    : aiProxyClient.system.dashboard.get(params);
