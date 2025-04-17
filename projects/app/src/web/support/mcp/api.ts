import type { updateBody } from '@/pages/api/support/mcp/update';
import { GET, POST, DELETE, PUT } from '../../common/api/request';
import type { createBody } from '@/pages/api/support/mcp/create';
import type { listResponse } from '@/pages/api/support/mcp/list';

export const getMcpServerList = () => {
  return GET<listResponse>('/support/mcp/list');
};

export const postCreateMcpServer = (data: createBody) => {
  return POST('/support/mcp/create', data);
};

export const putUpdateMcpServer = (data: updateBody) => {
  return PUT('/support/mcp/update', data);
};

export const deleteMcpServer = (id: string) => {
  return DELETE(`/support/mcp/delete`, { id });
};
