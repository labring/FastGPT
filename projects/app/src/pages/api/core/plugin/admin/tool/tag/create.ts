import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/types';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { CreatePluginToolTagBody } from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export type CreatePluginTagQuery = Record<string, never>;

export type CreatePluginTagResponse = SystemPluginToolTagType;

async function handler(
  req: ApiRequestProps<CreatePluginToolTagBody, CreatePluginTagQuery>,
  _res: ApiResponseType<any>
): Promise<CreatePluginTagResponse> {
  await authSystemAdmin({ req });

  const { tagName } = req.body;

  if (!tagName || !tagName.trim()) {
    return Promise.reject('Tag name is required');
  }

  const firstTag = await MongoPluginToolTag.findOne().sort({ tagOrder: 1 }).lean();

  return await MongoPluginToolTag.create({
    tagId: getNanoid(6),
    tagName: tagName.trim(),
    tagOrder: firstTag ? firstTag.tagOrder - 1 : 0
  });
}

export default NextAPI(handler);
