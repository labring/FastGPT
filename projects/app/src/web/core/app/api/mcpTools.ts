import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  UpdateMcpToolsBodyType,
  CreateMcpToolsBodyType,
  GetMcpChildrenQueryType,
  GetMcpChildrenResponseType,
  GetMcpToolsBodyType,
  GetMcpToolsResponseType,
  RunMcpToolBodyType,
  RunMcpToolResponseType,
  UpdateMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { CreateAppResponseType } from '@fastgpt/global/openapi/core/app/common/api';

/** 将 MCP JSON-RPC 错误中的 FastGPT i18n key 提取出来，交给 useRequest 翻译显示。 */
const normalizeMcpError = (error: unknown): never => {
  const message = String(getErrText(error));
  const match = message.match(/^MCP error -?\d+: (.+)$/);

  if (match?.[1]) {
    // 使用普通错误对象交给 useRequest，避免开发环境把业务提示显示成 Runtime Error。
    throw { message: match[1] };
  }

  throw error;
};

const requestMcp = <T>(request: () => Promise<T>) => request().catch(normalizeMcpError);

/* ============ mcp tools ============== */
export const postCreateMCPTools = (data: CreateMcpToolsBodyType) =>
  POST<CreateAppResponseType>('/core/app/mcpTools/create', data);

export const postUpdateMCPTools = (data: UpdateMcpToolsBodyType) =>
  PUT<UpdateMcpToolsResponseType>('/core/app/mcpTools/update', data);

export const getMCPTools = (data: GetMcpToolsBodyType) =>
  requestMcp(() => POST<GetMcpToolsResponseType>('/core/app/mcpTools/getTools', data));

export const postRunMCPTool = (data: RunMcpToolBodyType) =>
  requestMcp(() =>
    POST<RunMcpToolResponseType>('/core/app/mcpTools/runTool', data, { timeout: 600000 })
  );

export const getMcpChildren = (data: GetMcpChildrenQueryType) =>
  GET<GetMcpChildrenResponseType>('/core/app/mcpTools/getChildren', data);
