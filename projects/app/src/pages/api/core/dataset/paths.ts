import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type {
  GetPathProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const { sourceId: datasetId, type } = req.query as GetPathProps;

  if (!datasetId) {
    return [];
  }

  const { dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ReadPermissionVal
  });

  return await getParents(type === 'current' ? dataset._id : dataset.parentId);
}

export async function getParents(parentId?: string): Promise<ParentTreePathItemType[]> {
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
