import type { NextApiRequest, NextApiResponse } from 'next';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type.d';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<ParentTreePathItemType[]> {
  const { parentId } = req.query as { parentId: string };

  if (!parentId) {
    return [];
  }

  await authApp({ req, authToken: true, appId: parentId, per: ReadPermissionVal });

  return await getParents(parentId);
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
