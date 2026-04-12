import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

/*
  Collection sync
  1. Check collection type: link, api dataset collection
  2. Get collection and raw text
  3. Check whether the original text is the same: skip if same
  4. Create new collection
  5. Delete old collection
*/
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = SyncCollectionBodySchema.parse(req.body);

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  return SyncCollectionResponseSchema.parse(await syncCollection(collection));
}

export default NextAPI(handler);
