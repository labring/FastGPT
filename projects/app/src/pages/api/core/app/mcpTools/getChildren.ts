import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { McpToolConfigType } from '@fastgpt/global/core/app/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';

export type McpGetChildrenmQuery = {
  id: string;
};
export type McpGetChildrenmBody = {};
export type McpGetChildrenmResponse = (McpToolConfigType & {
  id: string;
  avatar: string;
})[];

async function handler(
  req: ApiRequestProps<McpGetChildrenmBody, McpGetChildrenmQuery>,
  _res: ApiResponseType<any>
): Promise<McpGetChildrenmResponse> {
  const { id } = req.query;

  const app = await MongoApp.findOne({ _id: id }).lean();

  if (!app) return Promise.reject(new UserError('No Mcp Toolset found'));

  if (app.type !== AppTypeEnum.toolSet)
    return Promise.reject(new UserError('the parent is not a mcp toolset'));

  return getMCPChildren(app);
}
export default NextAPI(handler);
