import { NextAPI } from '@/service/middleware/entry';
import { getDatasetTrainingErrorReadScope } from '@/service/core/dataset/training/errorScope';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
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
  type GetDatasetTrainingErrorResponse,
  type TrainingErrorGroupType,
  type TrainingErrorItemType
} from '@fastgpt/global/openapi/core/dataset/training/api';
import {
  getTrainingErrorPage,
  getTrainingErrorPipeline,
  pageTrainingErrors
} from '@fastgpt/service/core/dataset/training/errorQuery';
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
    const targetId = new Types.ObjectId(collectionId);
    const scope = {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(dataset._id)
    };
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
      scope: { ...scope, collectionId: targetId },
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
  const [result] = await MongoDatasetCollection.aggregate<{
    list: { _id: Types.ObjectId; errorCount: number }[];
    counts: { total: number }[];
  }>(
    [
      ...(await getTrainingErrorPipeline(scope)),
      { $group: { _id: '$collectionId', errorCount: { $sum: 1 } } },
      {
        $facet: {
          list: [{ $sort: { _id: 1 } }, { $skip: offset }, { $limit: pageSize }],
          counts: [{ $count: 'total' }]
        }
      }
    ],
    readFromSecondary
  );
  const { list: collectionStats = [], counts = [] } = result ?? {};
  const total = counts[0]?.total ?? 0;

  const collectionIds = collectionStats.map((item) => item._id);
  const collections = collectionIds.length
    ? await MongoDatasetCollection.find(
        {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(dataset._id),
          _id: { $in: collectionIds },
          type: { $ne: DatasetCollectionTypeEnum.folder }
        },
        undefined,
        readFromSecondary
      ).lean()
    : [];
  const collectionMap = new Map(
    collections.map((collection) => [String(collection._id), collection])
  );
  const statsMap = new Map(collectionStats.map((item) => [String(item._id), item.errorCount]));
  const itemsList = collectionIds.length
    ? await Promise.all(
        collectionIds.map(async (collectionId) =>
          MongoDatasetCollection.aggregate<TrainingErrorItemType>(
            [
              ...(await getTrainingErrorPipeline({ ...scope, collectionId })),
              ...pageTrainingErrors(0, itemLimit)
            ],
            readFromSecondary
          )
        )
      )
    : [];

  const list = collectionIds.reduce<TrainingErrorGroupType[]>((groups, id, index) => {
    const collection = collectionMap.get(String(id));
    const errorCount = statsMap.get(String(id)) ?? 0;
    const items = itemsList[index] ?? [];
    if (!collection || errorCount === 0 || items.length === 0) return groups;

    const { sourceName, sourceId } = getCollectionSourceData(collection);

    groups.push({
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
      hasMoreItems: items.length < errorCount
    });
    return groups;
  }, []);

  return GetDatasetTrainingErrorResponseSchema.parse({
    total,
    list
  });
}

export default NextAPI(handler);
export type getDatasetTrainingErrorBody = GetDatasetTrainingErrorBody;
export type getDatasetTrainingErrorResponse = GetDatasetTrainingErrorResponse;
