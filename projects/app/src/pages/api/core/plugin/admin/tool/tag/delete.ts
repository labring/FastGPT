import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { DeletePluginToolTagQuery } from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';

async function handler(
  req: ApiRequestProps<{}, DeletePluginToolTagQuery>,
  res: ApiResponseType<any>
): Promise<{}> {
  await authSystemAdmin({ req });

  const { tagId } = req.query;

  if (!tagId) {
    return Promise.reject('Tag ID is required');
  }

  const tag = await MongoPluginToolTag.findOne({ tagId });

  if (!tag) {
    return Promise.reject('Tag not found');
  }

  await MongoPluginToolTag.deleteOne({ tagId });

  return {};
}

export default NextAPI(handler);
