import type { NextApiRequest } from 'next';
import { DatasetTrainingCollectionName } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type.d';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: NextApiRequest
): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  let {
    datasetId,
    parentId = null,
    searchText = '',
    selectFolder = false,
    filterTags = [],
    simple = false
  } = req.body as GetDatasetCollectionsProps;
  let { pageSize, offset } = parsePaginationRequest(req);
  pageSize = Math.min(pageSize, 30);
  searchText = searchText?.replace(/'/g, '');

  // auth dataset and get my role
  const { teamId, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const match = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    parentId: parentId ? new Types.ObjectId(parentId) : null,
    ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
    ...(searchText
      ? {
          name: new RegExp(searchText, 'i')
        }
      : {}),
    ...(filterTags.length ? { tags: { $in: filterTags } } : {})
  };

  const selectField = {
    _id: 1,
    parentId: 1,
    tmbId: 1,
    name: 1,
    type: 1,
    forbid: 1,
    createTime: 1,
    updateTime: 1,
    trainingType: 1,
    fileId: 1,
    rawLink: 1,
    tags: 1,
    externalFileId: 1
  };

  // not count data amount
  if (simple) {
    const collections = await MongoDatasetCollection.find(match, undefined, {
      ...readFromSecondary
    })
      .select(selectField)
      .sort({
        updateTime: -1
      })
      .lean();

    return {
      list: await Promise.all(
        collections.map(async (item) => ({
          ...item,
          tags: await collectionTagsToTagLabel({
            datasetId,
            tags: item.tags
          }),
          dataAmount: 0,
          trainingAmount: 0,
          permission
        }))
      ),
      total: await MongoDatasetCollection.countDocuments(match)
    };
  }

  const [collections, total]: [DatasetCollectionsListItemType[], number] = await Promise.all([
    MongoDatasetCollection.aggregate([
      {
        $match: match
      },
      {
        $sort: { updateTime: -1 }
      },
      {
        $skip: offset
      },
      {
        $limit: pageSize
      },
      // count training data
      {
        $lookup: {
          from: DatasetTrainingCollectionName,
          let: { id: '$_id', team_id: match.teamId, dataset_id: match.datasetId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$teamId', '$$team_id'] }, { $eq: ['$collectionId', '$$id'] }]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'trainingCount'
        }
      },
      // count collection total data
      {
        $lookup: {
          from: DatasetDataCollectionName,
          let: { id: '$_id', team_id: match.teamId, dataset_id: match.datasetId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$teamId', '$$team_id'] },
                    { $eq: ['$datasetId', '$$dataset_id'] },
                    { $eq: ['$collectionId', '$$id'] }
                  ]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'dataCount'
        }
      },
      {
        $project: {
          ...selectField,
          dataAmount: {
            $ifNull: [{ $arrayElemAt: ['$dataCount.count', 0] }, 0]
          },
          trainingAmount: {
            $ifNull: [{ $arrayElemAt: ['$trainingCount.count', 0] }, 0]
          }
        }
      }
    ]),
    MongoDatasetCollection.countDocuments(match, {
      ...readFromSecondary
    })
  ]);

  const list = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      tags: await collectionTagsToTagLabel({
        datasetId,
        tags: item.tags
      }),
      permission
    }))
  );

  if (list.find((item) => item.trainingAmount > 0)) {
    startTrainingQueue();
  }

  // count collections
  return {
    list,
    total
  };
}

export default NextAPI(handler);
