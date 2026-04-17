import { GET, POST, DELETE, PUT } from '../../common/api/request';
import type {
  McpCreateBodyType,
  McpListResponseType,
  McpUpdateBodyType
} from '@fastgpt/global/openapi/support/mcpServer/api';

export const getMcpServerList = () => {
  return GET<McpListResponseType>('/support/mcp/list');
};

export const postCreateMcpServer = (data: McpCreateBodyType) => {
  return POST('/support/mcp/create', data);
};

export const putUpdateMcpServer = (data: McpUpdateBodyType) => {
  return PUT('/support/mcp/update', data);
};

export const deleteMcpServer = (id: string) => {
  return DELETE(`/support/mcp/delete`, { id });
};
