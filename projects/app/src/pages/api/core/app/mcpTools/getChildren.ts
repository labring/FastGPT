import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

export type McpGetChildrenmQuery = {
  id: string;
  searchKey?: string;
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
  const { id, searchKey } = req.query;

  const app = await MongoApp.findOne({ _id: id }).lean();

  if (!app) return Promise.reject(new UserError('No Mcp Toolset found'));

  if (app.type !== AppTypeEnum.mcpToolSet)
    return Promise.reject(new UserError('the parent is not a mcp toolset'));

  return (await getMCPChildren(app)).filter((item) => {
    if (searchKey && searchKey.trim() !== '') {
      const regx = new RegExp(replaceRegChars(searchKey.trim()), 'i');
      return regx.test(item.name);
    }
    return true;
  });
}
export default NextAPI(handler);
