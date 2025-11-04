import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdatePluginToolTagBody } from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';

async function handler(
  req: ApiRequestProps<UpdatePluginToolTagBody>,
  res: ApiResponseType<any>
): Promise<{}> {
  await authSystemAdmin({ req });

  const { tagId, tagName } = req.body;

  if (!tagId || !tagName || !tagName.trim()) {
    return Promise.reject('Missing params');
  }

  const tag = await MongoPluginToolTag.findOne({ tagId });

  if (!tag) {
    return Promise.reject('Tag not found');
  }

  await MongoPluginToolTag.updateOne(
    { tagId },
    {
      $set: {
        tagName: tagName.trim()
      }
    }
  );

  return {};
}

export default NextAPI(handler);
