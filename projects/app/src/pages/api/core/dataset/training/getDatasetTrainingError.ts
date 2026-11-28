import { NextAPI } from '@/service/middleware/entry';
import { getDatasetTrainingErrorReadScope } from '@/service/core/dataset/training/errorScope';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DatasetTrainingErrorPaginationLimits,
  GetDatasetTrainingErrorBodySchema,
  GetDatasetTrainingErrorResponseSchema,
  type GetDatasetTrainingErrorBody,
  type GetDatasetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import {
  getTrainingErrorCollectionPage,
  getTrainingErrorPage
} from '@fastgpt/service/core/dataset/training/mongo/errorQuery';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';

async function handler(req: ApiRequestProps): Promise<GetDatasetTrainingErrorResponse> {
  const {
    datasetId,
    collectionId,
    itemOffset = 0,
    itemPageSize = DatasetTrainingErrorPaginationLimits.defaultItemPageSize
  } = parseApiInput({
    req,
    bodySchema: GetDatasetTrainingErrorBodySchema
  }).body;
  const { offset, pageSize } = parsePaginationRequest(req);
  const itemLimit = Math.min(itemPageSize, DatasetTrainingErrorPaginationLimits.maxItemPageSize);
  const itemSkip = Math.min(itemOffset, DatasetTrainingErrorPaginationLimits.maxItemOffset);

  const auth = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  const { teamId, dataset } = auth;

  if (collectionId) {
    const { collection } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: ReadPermissionVal
    });

    if (
      String(collection.datasetId) !== String(dataset._id) ||
      collection.type === DatasetCollectionTypeEnum.folder
    ) {
      return GetDatasetTrainingErrorResponseSchema.parse({
        total: 0,
        list: []
      });
    }

    const { items, total: errorCount } = await getTrainingErrorPage({
      scope: { teamId: String(teamId), datasetId: String(dataset._id), collectionId },
      offset: itemSkip,
      limit: itemLimit
    });
    const { sourceName, sourceId } = getCollectionSourceData(collection);

    return GetDatasetTrainingErrorResponseSchema.parse({
      total: errorCount > 0 ? 1 : 0,
      list:
        errorCount > 0
          ? [
              {
                collection: {
                  _id: collection._id,
                  collectionId: collection._id,
                  name: collection.name,
                  type: collection.type,
                  sourceName,
                  sourceId
                },
                items,
                errorCount,
                hasMoreItems: itemSkip + items.length < errorCount
              }
            ]
          : []
    });
  }

  const scope = await getDatasetTrainingErrorReadScope(auth);
  const result = await getTrainingErrorCollectionPage({
    scope,
    offset,
    limit: pageSize,
    itemLimit
  });
  return GetDatasetTrainingErrorResponseSchema.parse(result);
}

export default NextAPI(handler);
export type getDatasetTrainingErrorBody = GetDatasetTrainingErrorBody;
export type getDatasetTrainingErrorResponse = GetDatasetTrainingErrorResponse;
