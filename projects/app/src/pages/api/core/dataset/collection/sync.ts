import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/*
  Collection sync
  1. Check collection type: link, api dataset collection
  2. Get collection and raw text
  3. Check whether the original text is the same: skip if same
  4. Create new collection
  5. Delete old collection
*/
async function handler(req: ApiRequestProps): Promise<SyncCollectionResponseType> {
  const { collectionId } = parseApiInput({ req, bodySchema: SyncCollectionBodySchema }).body;

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const result = await syncCollection(collection);

  void addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.SYNC_DATASET,
    params: {
      datasetName: collection.dataset?.name ?? ''
    }
  });

  return SyncCollectionResponseSchema.parse(result);
}

export default NextAPI(handler);
