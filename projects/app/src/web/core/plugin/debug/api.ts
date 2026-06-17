import { GET, POST } from '@/web/common/api/request';
import type {
  CreatePluginDebugSessionBodyType,
  CreatePluginDebugSessionResponseType,
  DisconnectPluginDebugSessionResponseType,
  PluginDebugSessionStatusResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export const createPluginDebugSession = (data: CreatePluginDebugSessionBodyType = {}) =>
  POST<CreatePluginDebugSessionResponseType>('/core/plugin/debug/session', data);

export const getPluginDebugSessionStatus = (debugSessionId: string) =>
  GET<PluginDebugSessionStatusResponseType>(`/core/plugin/debug/session/${debugSessionId}`);

export const disconnectPluginDebugSession = (debugSessionId: string) =>
  POST<DisconnectPluginDebugSessionResponseType>(
    `/core/plugin/debug/session/${debugSessionId}/disconnect`
  );
