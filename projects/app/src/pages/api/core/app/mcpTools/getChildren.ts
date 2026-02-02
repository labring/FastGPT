import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  GetMcpChildrenQuerySchema,
  GetMcpChildrenResponseSchema,
  type GetMcpChildrenQueryType,
  type GetMcpChildrenResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';

async function handler(
  req: ApiRequestProps<{}, GetMcpChildrenQueryType>,
  _res: ApiResponseType<any>
): Promise<GetMcpChildrenResponseType> {
  const { id, searchKey } = GetMcpChildrenQuerySchema.parse(req.query);

  const app = await MongoApp.findOne({ _id: id }).lean();

  if (!app) return Promise.reject(new UserError('No Mcp Toolset found'));

  if (app.type !== AppTypeEnum.mcpToolSet)
    return Promise.reject(new UserError('the parent is not a mcp toolset'));

  const toolList = (await getMCPChildren(app)).filter((item) => {
    if (searchKey && searchKey.trim() !== '') {
      const regx = new RegExp(replaceRegChars(searchKey.trim()), 'i');
      return regx.test(item.name);
    }
    return true;
  });
  return GetMcpChildrenResponseSchema.parse(toolList);
}
export default NextAPI(handler);
