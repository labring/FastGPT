import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetAuditEventEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  CreateLinkCollectionBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import {
  getCollectionAuditLocation,
  getCollectionAuditObjectType
} from '@fastgpt/service/core/dataset/collection/audit';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { link, ...body } = parseApiInput({ req, bodySchema: CreateLinkCollectionBodySchema }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  const result = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      name: link,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.link,
      metadata: {
        relatedImgId: link,
        webPageSelector: body?.metadata?.webPageSelector
      },
      rawLink: link
    }
  });

  void addAuditLog({
    tmbId,
    teamId,
    event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE,
    params: {
      collectionName: link,
      objectType: getCollectionAuditObjectType(DatasetCollectionTypeEnum.link),
      location: await getCollectionAuditLocation({
        datasetName: dataset.name,
        parentId: body.parentId
      })
    }
  });

  return result;
}

export default NextAPI(handler);
