import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetStatusEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    await MongoDatasetCollection.updateMany({ createTime: { $exists: false } }, [
      {
        $set: {
          createTime: '$updateTime'
        }
      }
    ]);
    await MongoDatasetCollection.updateMany({ trainingType: { $exists: false } }, [
      {
        $set: {
          trainingType: {
            $cond: {
              if: { $ifNull: ['$a', false] },
              then: TrainingModeEnum.qa,
              else: TrainingModeEnum.chunk
            }
          }
        }
      }
    ]);
    await MongoDatasetCollection.updateMany({ chunkSize: { $exists: false } }, [
      {
        $set: {
          chunkSize: 0
        }
      }
    ]);
    await MongoDatasetCollection.updateMany({ fileId: { $exists: false } }, [
      {
        $set: {
          fileId: '$metadata.fileId'
        }
      }
    ]);
    await MongoDatasetCollection.updateMany({ rawLink: { $exists: false } }, [
      {
        $set: {
          rawLink: '$metadata.rawLink'
        }
      }
    ]);

    await MongoDatasetData.updateMany(
      { chunkIndex: { $exists: false } },
      {
        chunkIndex: 0
      }
    );
    await MongoDatasetData.updateMany(
      { updateTime: { $exists: false } },
      {
        updateTime: new Date()
      }
    );

    await MongoDataset.updateMany(
      { status: { $exists: false } },
      {
        $set: {
          status: DatasetStatusEnum.active
        }
      }
    );

    // dataset tags to intro
    await MongoDataset.updateMany({ tags: { $exists: true } }, [
      {
        $set: {
          intro: {
            $reduce: {
              input: '$tags',
              initialValue: '',
              in: { $concat: ['$$value', ' ', '$$this'] }
            }
          }
        }
      }
    ]);

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
