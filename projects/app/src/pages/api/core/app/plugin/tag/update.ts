import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type UpdatePluginTagQuery = {};

export type UpdatePluginTagBody = {
  tagId: string;
  tagName: string;
};

export type UpdatePluginTagResponse = {};

async function handler(
  req: ApiRequestProps<UpdatePluginTagBody, UpdatePluginTagQuery>,
  res: ApiResponseType<any>
): Promise<UpdatePluginTagResponse> {
  await authSystemAdmin({ req });

  const { tagId, tagName } = req.body;

  if (!tagId || !tagName || !tagName.trim()) {
    return Promise.reject('Missing params');
  }

  const tag = await MongoPluginTag.findOne({ tagId });

  if (!tag) {
    return Promise.reject('Tag not found');
  }

  await MongoPluginTag.updateOne(
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
