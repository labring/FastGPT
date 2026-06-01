import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdatePluginToolTagOrderBody } from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';

async function handler(req: ApiRequestProps<UpdatePluginToolTagOrderBody>): Promise<void> {
  await authSystemAdmin({ req });

  const { tags } = req.body;

  if (!tags || !Array.isArray(tags)) {
    throw new Error('Tags array is required');
  }

  await mongoSessionRun(async (session) => {
    for (const tag of tags) {
      await MongoPluginToolTag.updateOne(
        { tagId: tag.tagId },
        { $set: { tagOrder: tag.tagOrder } },
        { session }
      );
    }
  });
}

export default NextAPI(handler);
