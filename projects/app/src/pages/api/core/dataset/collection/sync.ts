import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SyncCollectionBodySchema,
  SyncCollectionResponseSchema,
  type SyncCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  createUserAuditActor,
  getEnterpriseAuditRequestContext,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';

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

  const { collection, teamId, tmbId, userId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  try {
    const result = await syncCollection(collection);
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Success,
      actor: createUserAuditActor({ userId, teamId, tmbId }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Collection,
        id: collectionId,
        name: collection.name
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        syncResult: result,
        datasetId: String(collection.datasetId),
        datasetName: collection.dataset?.name,
        collectionType: collection.type
      }
    });
    return SyncCollectionResponseSchema.parse(result);
  } catch (error) {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createUserAuditActor({ userId, teamId, tmbId }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Collection,
        id: collectionId,
        name: collection.name
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        datasetId: String(collection.datasetId),
        datasetName: collection.dataset?.name,
        collectionType: collection.type,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

export default NextAPI(handler);
