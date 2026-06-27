import { GET, POST } from '@/web/common/api/request';
import type {
  EnablePluginDebugChannelBodyType,
  EnablePluginDebugChannelResponseType,
  GetPluginDebugChannelResponseType,
  RefreshPluginDebugConnectionKeyBodyType,
  RefreshPluginDebugConnectionKeyResponseType,
  RevokePluginDebugChannelResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export const enablePluginDebugChannel = (data: EnablePluginDebugChannelBodyType = {}) =>
  POST<EnablePluginDebugChannelResponseType>('/plugin/debug-channel/enable', data);

export const refreshPluginDebugConnectionKey = (
  data: RefreshPluginDebugConnectionKeyBodyType = {}
) => POST<RefreshPluginDebugConnectionKeyResponseType>('/plugin/debug-channel/key:refresh', data);

export const getPluginDebugChannel = () =>
  GET<GetPluginDebugChannelResponseType>('/plugin/debug-channel', {});

export const revokePluginDebugChannel = () =>
  POST<RevokePluginDebugChannelResponseType>('/plugin/debug-channel/revoke', {});
