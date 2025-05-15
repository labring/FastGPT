import { NextAPI } from '@/service/middleware/entry';
import { batchAddTagsToApp } from '@fastgpt/service/core/app/tags/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  appId: string;
  tagIds: string[];
};

async function handler(req: ApiRequestProps<Props>) {
  if (req.method !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const { appId, tagIds } = req.body;

  if (!appId) {
    throw new Error('App ID cannot be empty');
  }

  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    throw new Error('Tag IDs must be a non-empty array');
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  return batchAddTagsToApp({
    appId,
    tagIds,
    teamId
  });
}

export default NextAPI(handler);
