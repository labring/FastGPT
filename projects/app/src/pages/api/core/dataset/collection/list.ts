import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { DatasetTrainingCollectionName } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/response';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { PagingData } from '@/types';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { countCollectionData } from '@/service/core/dataset/data/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { startQueue } from '@/service/utils/tools';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { getTeamInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

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

    // auth dataset and get my role
    const { tmbId } = await authDataset({ req, authToken: true, datasetId, per: 'r' });
    const { canWrite } = await getTeamInfoByTmbId({ tmbId });

    const match = {
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
      const collections = await MongoDatasetCollection.find(match, '_id name type parentId')
        .sort({
          updateTime: -1
        })
        .lean();
      return jsonRes<PagingData<DatasetCollectionsListItemType>>(res, {
        data: {
          pageNum,
          pageSize,
          data: await Promise.all(
            collections.map(async (item) => ({
              ...item,
              dataAmount: 0,
              trainingAmount: 0,
              canWrite // admin or owner can write
            }))
          ),
          total: await MongoDatasetCollection.countDocuments(match)
        }
      });
    }

    const collections: DatasetCollectionsListItemType[] = await MongoDatasetCollection.aggregate([
      {
        $match: match
      },
      {
        $lookup: {
          from: DatasetTrainingCollectionName,
          localField: '_id',
          foreignField: 'datasetCollectionId',
          as: 'trainings_amount'
        }
      },
      // 统计子集合的数量和子训练的数量
      {
        $project: {
          _id: 1,
          parentId: 1,
          tmbId: 1,
          name: 1,
          type: 1,
          updateTime: 1,
          trainingAmount: { $size: '$trainings_amount' },
          metadata: 1
        }
      },
      {
        $sort: { updateTime: -1 }
      },
      {
        $skip: (pageNum - 1) * pageSize
      },
      {
        $limit: pageSize
      }
    ]);

    const counts = await countCollectionData({
      collectionIds: collections.map((item) => item._id),
      datasetId
    });

    const data = await Promise.all(
      collections.map(async (item, i) => ({
        ...item,
        dataAmount: item.type === DatasetCollectionTypeEnum.folder ? undefined : counts[i],
        canWrite: String(item.tmbId) === tmbId || canWrite
      }))
    );

    if (data.find((item) => item.trainingAmount > 0)) {
      startQueue(1);
    }

    // count collections
    jsonRes<PagingData<DatasetCollectionsListItemType>>(res, {
      data: {
        pageNum,
        pageSize,
        data,
        total: await MongoDatasetCollection.countDocuments(match)
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
