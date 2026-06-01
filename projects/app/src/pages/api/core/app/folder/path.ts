import type { NextApiRequest } from 'next';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppFolderPathQuerySchema,
  GetAppFolderPathResponseSchema
} from '@fastgpt/global/openapi/core/app/folder/api';

async function handler(req: NextApiRequest): Promise<ParentTreePathItemType[]> {
  const { sourceId: appId, type = 'current' } = parseApiInput({
    req,
    querySchema: GetAppFolderPathQuerySchema
  }).query;

  if (!appId) {
    return [];
  }

  const { app } = await authApp({ req, authToken: true, appId, per: ReadPermissionVal });

  return GetAppFolderPathResponseSchema.parse(
    await getParents(type === 'current' ? appId : app.parentId)
  );
}

export default NextAPI(handler);

async function getParents(parentId: ParentIdType): Promise<ParentTreePathItemType[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoApp.findById(parentId, 'name parentId');

  if (!parent) return [];

  const paths = await getParents(parent.parentId);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}
