import type { NextApiRequest } from 'next';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export default async function handler(req: NextApiRequest) {
  const { parentId } = req.query as { parentId: string };

  if (!parentId) {
    return [];
  }

  await authDatasetCollection({
    req,
    authToken: true,
    collectionId: parentId,
    per: ReadPermissionVal
  });
  const paths = await getDatasetCollectionPaths({
    parentId
  });

  return paths;
}
