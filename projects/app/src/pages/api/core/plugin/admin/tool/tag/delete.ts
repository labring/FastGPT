import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { DeletePluginToolTagQuery } from '@fastgpt/global/openapi/core/plugin/admin/tool/tag/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

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

  await mongoSessionRun(async (session) => {
    await MongoPluginToolTag.deleteOne({ tagId }, { session });

    await MongoSystemTool.updateMany(
      { 'customConfig.tags': tagId },
      { $pull: { 'customConfig.tags': tagId } },
      { session }
    );
  });

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
