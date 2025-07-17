import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { McpToolConfigType } from '@fastgpt/global/core/app/type';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';

export type McpGetChildrenmQuery = {
  parentId: string;
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
  const { parentId } = req.query;
  const app = await MongoApp.findOne({ _id: parentId }).lean();
  if (!app) return Promise.reject(new Error('No Mcp Toolset found'));
  if (app.type !== AppTypeEnum.toolSet)
    return Promise.reject(new Error('the parent is not a mcp toolset'));
  return (
    app.modules[0].toolConfig?.mcpToolSet?.toolList.map((item) => ({
      ...item,
      id: `${PluginSourceEnum.mcp}-${parentId}/${item.name}`,
      avatar: app.avatar
    })) ?? []
  );
}
export default NextAPI(handler);
