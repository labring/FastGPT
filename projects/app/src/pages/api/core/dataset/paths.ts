import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const { parentId } = req.query as { parentId: string };

  if (!parentId) {
    return [];
  }

  await authDataset({ req, authToken: true, datasetId: parentId, per: ReadPermissionVal });

  return await getParents(parentId);
}

async function getParents(parentId?: string): Promise<ParentTreePathItemType[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoDataset.findById(parentId, 'name parentId');

  if (!parent) return [];

  const paths = await getParents(parent.parentId);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}

export default NextAPI(handler);
