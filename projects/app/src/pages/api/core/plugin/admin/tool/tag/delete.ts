import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  DeletePluginToolTagQuerySchema,
  type DeletePluginToolTagQuery
} from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<Record<string, never>, DeletePluginToolTagQuery>
): Promise<void> {
  await authSystemAdmin({ req });

  const { tagId } = parseApiInput({ req, querySchema: DeletePluginToolTagQuerySchema }).query;

  const tag = await MongoPluginToolTag.findOne({ tagId });

  if (!tag) {
    return Promise.reject('Tag not found');
  }

  await mongoSessionRun(async (session) => {
    await MongoPluginToolTag.deleteOne({ tagId }, { session });

    await MongoSystemTool.updateMany(
      { 'customConfig.tags': tagId },
      { $pull: { 'customConfig.tags': tagId } },
      { session }
    );
  });
}

export default NextAPI(handler);
