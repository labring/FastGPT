import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetTrainingCollectionName } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type.d';

export type GetScrollCollectionsProps = PaginationProps<{
  datasetId: string;
  parentId?: string | null;
  searchText?: string;
  selectFolder?: boolean;
  filterTags?: string[];
  simple?: boolean;
}>;

async function handler(
  req: ApiRequestProps<GetScrollCollectionsProps, {}>
): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  let {
    datasetId,
    pageSize = 10,
    offset,
    parentId = null,
    searchText = '',
    selectFolder = false,
    filterTags = [],
    simple = false
  } = req.body;
  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

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
      : {}),
    ...(filterTags.length ? { tags: { $all: filterTags } } : {})
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
    tags: 1
  };

  // not count data amount
  if (simple) {
    const collections = await MongoDatasetCollection.find(match)
      .select(selectField)
      .sort({
        updateTime: -1
      })
      .skip(offset)
      .limit(pageSize)
      .lean();

    return {
      list: await Promise.all(
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
    MongoDatasetCollection.countDocuments(match)
  ]);

  const data = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      permission
    }))
  );

  // count collections
  return {
    list: data,
    total
  };
}

export default NextAPI(handler);
