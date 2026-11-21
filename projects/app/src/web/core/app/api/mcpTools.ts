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
import { getMcpOAuthErrorCode } from '@/pageComponents/app/detail/Edit/MCPTools/oauth/utils';

/**
 * 运行期错误归一化。
 *
 * oauth 模式失败时服务端返回固定 `data.oauthCode`，这里转成既有
 * `mcpOAuth.error.<code>` i18n key（由 `useRequest` 统一 `t()`），并把 `oauthCode`
 * 一并抛给调用方用于「重新授权」引导；没有 `oauthCode` 时保持原有 MCP 错误处理。
 */
const normalizeMcpError = (error: unknown): never => {
  const oauthCode = getMcpOAuthErrorCode(error);
  if (oauthCode) {
    throw { message: `mcpOAuth.error.${oauthCode}`, oauthCode };
  }

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
