import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { DatasetTrainingCollectionName } from '@fastgpt/service/core/dataset/training/schema';
import { authUser } from '@fastgpt/service/support/user/auth';

import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsResponse } from '@/global/core/dataset/response';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { PagingData } from '@/types';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { countCollectionData } from '@/service/core/dataset/data/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    let {
      pageNum = 1,
      pageSize = 10,
      datasetId,
      parentId = null,
      searchText = ''
    } = req.body as GetDatasetCollectionsProps;
    searchText = searchText?.replace(/'/g, '');

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const match = {
      userId: new Types.ObjectId(userId),
      datasetId: new Types.ObjectId(datasetId),
      parentId: parentId ? new Types.ObjectId(parentId) : null,
      ...(searchText
        ? {
            name: new RegExp(searchText, 'i')
          }
        : {})
    };

    const collections = await MongoDatasetCollection.aggregate([
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
          fileId: 1,
          name: 1,
          type: 1,
          updateTime: 1,
          trainingAmount: { $size: '$trainings_amount' }
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

    // count collections
    jsonRes<PagingData<DatasetCollectionsResponse>>(res, {
      data: {
        pageNum,
        pageSize,
        data: await Promise.all(
          collections.map(async (item) => ({
            ...item,
            dataAmount:
              item.type !== DatasetCollectionTypeEnum.folder
                ? await countCollectionData({
                    collectionId: item._id,
                    userId
                  })
                : undefined
          }))
        ),
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
