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
import type { CreateAppResponseType } from '@fastgpt/global/openapi/core/app/common/api';

/* ============ mcp tools ============== */
export const postCreateMCPTools = (data: CreateMcpToolsBodyType) =>
  POST<CreateAppResponseType>('/core/app/mcpTools/create', data);

export const postUpdateMCPTools = (data: UpdateMcpToolsBodyType) =>
  PUT<UpdateMcpToolsResponseType>('/core/app/mcpTools/update', data);

export const getMCPTools = (data: GetMcpToolsBodyType) =>
  POST<GetMcpToolsResponseType>('/core/app/mcpTools/getTools', data);

export const postRunMCPTool = (data: RunMcpToolBodyType) =>
  POST<RunMcpToolResponseType>('/core/app/mcpTools/runTool', data, { timeout: 300000 });

export const getMcpChildren = (data: GetMcpChildrenQueryType) =>
  GET<GetMcpChildrenResponseType>('/core/app/mcpTools/getChildren', data);
