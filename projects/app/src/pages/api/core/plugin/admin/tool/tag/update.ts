import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  UpdatePluginToolTagBodySchema,
  type UpdatePluginToolTagBody
} from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<UpdatePluginToolTagBody>): Promise<void> {
  await authSystemAdmin({ req });

  const { tagId, tagName } = parseApiInput({
    req,
    bodySchema: UpdatePluginToolTagBodySchema
  }).body;

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
}

export default NextAPI(handler);
