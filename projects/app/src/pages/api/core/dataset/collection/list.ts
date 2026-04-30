/** @deprecated */
import type { NextApiRequest } from 'next';
import { DatasetTrainingCollectionName } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { z } from 'zod';

const BodySchema = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  datasetId: z.string(),
  parentId: z.string().nullable().optional().default(null),
  searchText: z.string().optional().default(''),
  selectFolder: z.boolean().optional().default(false),
  filterTags: z.array(z.string()).optional().default([]),
  simple: z.boolean().optional().default(false)
});

async function handler(req: NextApiRequest) {
  const { pageNum, pageSize, datasetId, parentId, searchText, selectFolder, filterTags, simple } =
    BodySchema.parse(req.body);
  const regexText = searchText ? replaceRegChars(searchText) : '';

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
    ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
    ...(regexText
      ? {
          name: new RegExp(regexText, 'i')
        }
      : {
          parentId: parentId ? new Types.ObjectId(parentId) : null
        }),
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
      pageNum,
      pageSize,
      data: await Promise.all(
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

  const data = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      tags: await collectionTagsToTagLabel({
        datasetId,
        tags: item.tags
      }),
      permission
    }))
  );

  // count collections
  return {
    pageNum,
    pageSize,
    data,
    total
  };
}

export default NextAPI(handler);
