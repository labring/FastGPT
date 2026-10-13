import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getHTTPToolList } from '@fastgpt/service/core/app/http';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListToolSetV2BodySchema,
  ListToolSetV2ResponseSchema,
  type ListToolSetV2BodyType,
  type ListToolSetV2ResponseType
} from '@fastgpt/global/openapi/core/app/toolSet/api';

/** Return one paginated page of tools from an authenticated MCP or HTTP toolset. */
async function handler(
  req: ApiRequestProps<ListToolSetV2BodyType>
): Promise<ListToolSetV2ResponseType> {
  const {
    parentId,
    searchKey,
    pageNum = 1,
    pageSize = 50,
    offset
  } = parseApiInput({ req, bodySchema: ListToolSetV2BodySchema }).body;
  const { app } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    appId: parentId,
    per: ReadPermissionVal
  });

  if (app.type !== AppTypeEnum.mcpToolSet && app.type !== AppTypeEnum.httpToolSet) {
    return Promise.reject(new UserError('the parent is not a mcp or http toolset'));
  }

  const tools =
    app.type === AppTypeEnum.mcpToolSet ? await getMCPChildren(app) : await getHTTPToolList(app);
  const searchRegex = searchKey?.trim()
    ? new RegExp(replaceRegChars(searchKey.trim()), 'i')
    : undefined;
  const filteredTools = searchRegex
    ? tools.filter((tool) => searchRegex.test(`${tool.name}\n${tool.description ?? ''}`))
    : tools;
  const skip = offset ?? (pageNum - 1) * pageSize;
  const list = filteredTools.slice(skip, skip + pageSize).map((tool) => ({
    id: tool.id,
    avatar: tool.avatar ?? app.avatar,
    name: tool.name,
    intro: tool.description ?? '',
    flowNodeType: FlowNodeTypeEnum.tool,
    templateType: FlowNodeTemplateTypeEnum.teamApp,
    appType: app.type,
    isTool: true,
    isFolder: false
  }));

  return ListToolSetV2ResponseSchema.parse({ list, total: filteredTools.length });
}

export default NextAPI(handler);
