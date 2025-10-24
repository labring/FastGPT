import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type CreatePluginTagQuery = {};

export type CreatePluginTagBody = {
  tagName: string;
};

export type CreatePluginTagResponse = {};

async function handler(
  req: ApiRequestProps<CreatePluginTagBody, CreatePluginTagQuery>,
  res: ApiResponseType<any>
): Promise<CreatePluginTagResponse> {
  await authSystemAdmin({ req });

  const { tagName } = req.body;

  if (!tagName || !tagName.trim()) {
    return Promise.reject('Tag name is required');
  }

  const lastTag = await MongoPluginTag.findOne().sort({ tagOrder: -1 }).lean();
  const nextOrder = lastTag ? lastTag.tagOrder + 1 : 0;

  const tagId = getNanoid(6);

  await MongoPluginTag.create({
    tagId,
    tagName: tagName.trim(),
    tagOrder: nextOrder
  });

  return {};
}

export default NextAPI(handler);
