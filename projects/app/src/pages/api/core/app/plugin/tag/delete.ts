import { NextAPI } from '@/service/middleware/entry';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type DeletePluginTagQuery = {
  tagId: string;
};

export type DeletePluginTagBody = {};

export type DeletePluginTagResponse = {};

async function handler(
  req: ApiRequestProps<DeletePluginTagBody, DeletePluginTagQuery>,
  res: ApiResponseType<any>
): Promise<DeletePluginTagResponse> {
  await authSystemAdmin({ req });

  const { tagId } = req.query;

  if (!tagId) {
    return Promise.reject('Tag ID is required');
  }

  const tag = await MongoPluginTag.findOne({ tagId });

  if (!tag) {
    return Promise.reject('Tag not found');
  }

  await MongoPluginTag.deleteOne({ tagId });

  return {};
}

export default NextAPI(handler);
