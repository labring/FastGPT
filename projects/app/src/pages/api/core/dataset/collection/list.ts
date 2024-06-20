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

async function handler(req: NextApiRequest) {
  let {
    pageNum = 1,
    pageSize = 10,
    datasetId,
    parentId = null,
    searchText = '',
    selectFolder = false,
    simple = false
  } = req.body as GetDatasetCollectionsProps;
  searchText = searchText?.replace(/'/g, '');
  pageSize = Math.min(pageSize, 30);

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
      : {})
  };

  // not count data amount
  if (simple) {
    const collections = await MongoDatasetCollection.find(match, '_id parentId type name')
      .sort({
        updateTime: -1
      })
      .lean();
    return {
      pageNum,
      pageSize,
      data: await Promise.all(
        collections.map(async (item) => ({
          ...item,
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
        $skip: (pageNum - 1) * pageSize
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
          _id: 1,
          parentId: 1,
          tmbId: 1,
          name: 1,
          type: 1,
          status: 1,
          updateTime: 1,
          fileId: 1,
          rawLink: 1,
          dataAmount: {
            $ifNull: [{ $arrayElemAt: ['$dataCount.count', 0] }, 0]
          },
          trainingAmount: {
            $ifNull: [{ $arrayElemAt: ['$trainingCount.count', 0] }, 0]
          }
        }
      }
    ]),
    MongoDatasetCollection.countDocuments(match)
  ]);

  const data = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      permission
    }))
  );

  if (data.find((item) => item.trainingAmount > 0)) {
    startTrainingQueue();
  }

  // count collections
  return {
    pageNum,
    pageSize,
    data,
    total
  };
}

export default NextAPI(handler);
