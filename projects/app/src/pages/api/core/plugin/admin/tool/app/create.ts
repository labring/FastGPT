import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  CreateAppToolBodySchema,
  type CreateAppToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { validateSystemToolWorkflowAssociation } from '@fastgpt/service/core/app/tool/workflowTool/service';

export type createPluginQuery = Record<string, never>;

export type createPluginBody = CreateAppToolBodyType;

export type createPluginResponse = Record<string, never>;

export async function handler(
  req: ApiRequestProps<createPluginBody, createPluginQuery>,
  _res: ApiResponseType<any>
): Promise<createPluginResponse> {
  await authSystemAdmin({ req });
  const { body } = parseApiInput({
    req,
    bodySchema: CreateAppToolBodySchema
  });
  const {
    name,
    avatar,
    intro,
    tags,
    secretsVal,
    originCost,
    currentCost,
    systemKeyCost,
    hasTokenFee,
    status,
    associatedPluginId,
    userGuide,
    author
  } = body;

  await validateSystemToolWorkflowAssociation(associatedPluginId);

  const pluginId = `${AppToolSourceEnum.commercial}-${getNanoid(12)}`;

  const firstPlugin = await MongoSystemTool.findOne().sort({ pluginOrder: 1 }).lean();
  const pluginOrder = firstPlugin ? (firstPlugin.pluginOrder ?? 0) - 1 : 0;

  await MongoSystemTool.create({
    pluginId,
    status: status ?? PluginStatusEnum.Normal,
    secretsVal,
    originCost,
    currentCost,
    systemKeyCost,
    hasTokenFee,
    pluginOrder,
    customConfig: {
      name,
      avatar,
      intro,
      version: getNanoid(),
      tags,
      associatedPluginId,
      userGuide,
      author
    }
  });
  return {};
}

export default NextAPI(handler);
