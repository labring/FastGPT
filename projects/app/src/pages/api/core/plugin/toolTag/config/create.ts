import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { CreatePluginToolTagBody } from '@fastgpt/global/openapi/core/plugin/toolTag/api';

export type CreatePluginTagQuery = {};

export type CreatePluginTagResponse = {};

async function handler(
  req: ApiRequestProps<CreatePluginToolTagBody, CreatePluginTagQuery>,
  res: ApiResponseType<any>
): Promise<CreatePluginTagResponse> {
  await authSystemAdmin({ req });

  const { tagName } = req.body;

  if (!tagName || !tagName.trim()) {
    return Promise.reject('Tag name is required');
  }

  const firstTag = await MongoPluginTag.findOne().sort({ tagOrder: 1 }).lean();

  return await MongoPluginTag.create({
    tagId: getNanoid(6),
    tagName: tagName.trim(),
    tagOrder: firstTag ? firstTag.tagOrder - 1 : 0
  });
}

export default NextAPI(handler);
