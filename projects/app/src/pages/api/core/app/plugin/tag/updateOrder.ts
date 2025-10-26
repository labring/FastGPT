import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import type { PluginTagSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type UpdatePluginTagOrderQuery = {};

export type UpdatePluginTagOrderBody = {
  tags: PluginTagSchemaType[];
};

export type UpdatePluginTagOrderResponse = {};

async function handler(
  req: ApiRequestProps<UpdatePluginTagOrderBody, UpdatePluginTagOrderQuery>,
  res: ApiResponseType<any>
): Promise<UpdatePluginTagOrderResponse> {
  await authSystemAdmin({ req });

  const { tags } = req.body;

  if (!tags || !Array.isArray(tags)) {
    throw new Error('Tags array is required');
  }

  await mongoSessionRun(async (session) => {
    for (const tag of tags) {
      await MongoPluginTag.updateOne(
        { tagId: tag.tagId },
        { $set: { tagOrder: tag.tagOrder } },
        { session }
      );
    }
  });

  return {};
}

export default NextAPI(handler);
