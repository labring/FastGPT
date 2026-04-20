import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ListCollectionV2BodySchema,
  ListCollectionV2ResponseSchema,
  type ListCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps): Promise<ListCollectionV2ResponseType> {
  let {
    datasetId,
    parentId,
    searchText,
    selectFolder,
    filterTags,
    simple,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = ListCollectionV2BodySchema.parse(req.body);
  let pageSize = Math.min(Number(rawPageSize ?? 10), 100);
  let offset =
    rawOffset !== undefined ? Number(rawOffset) : (Number(rawPageNum ?? 1) - 1) * pageSize;
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
    ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
    ...(searchText
      ? {
          name: new RegExp(`${replaceRegChars(searchText)}`, 'i')
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
      .skip(offset)
      .limit(pageSize)
      .lean();

    return ListCollectionV2ResponseSchema.parse({
      list: await Promise.all(
        collections.map(async (item) => ({
          ...item,
          tags: await collectionTagsToTagLabel({
            datasetId,
            tags: item.tags
          }),
          dataAmount: 0,
          trainingAmount: 0,
          hasError: false,
          permission
        }))
      ),
      total: await MongoDatasetCollection.countDocuments(match)
    });
  }

  const [collections, total]: [DatasetCollectionSchemaType[], number] = await Promise.all([
    MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetCollection.countDocuments(match, { ...readFromSecondary })
  ]);
  const collectionIds = collections.map((item) => new Types.ObjectId(item._id));

  // Compute data amount
  const [trainingAmount, dataAmount]: [
    { _id: string; count: number; hasError: boolean }[],
    { _id: string; count: number }[]
  ] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } }
          }
        }
      ],
      {
        ...readFromSecondary
      }
    ),
    MongoDatasetData.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 }
          }
        }
      ],
      {
        ...readFromSecondary
      }
    )
  ]);

  const list = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      tags: await collectionTagsToTagLabel({
        datasetId,
        tags: item.tags
      }),
      trainingAmount:
        trainingAmount.find((amount) => String(amount._id) === String(item._id))?.count || 0,
      dataAmount: dataAmount.find((amount) => String(amount._id) === String(item._id))?.count || 0,
      hasError: trainingAmount.find((amount) => String(amount._id) === String(item._id))?.hasError,
      permission
    }))
  );

  // count collections
  return ListCollectionV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
