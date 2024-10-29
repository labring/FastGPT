import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MilvusCtrl } from '@fastgpt/service/common/vectorStore/milvus/class';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorStore/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';

export type resetMilvusQuery = {};

export type resetMilvusBody = {};

export type resetMilvusResponse = {};

async function handler(
  req: ApiRequestProps<resetMilvusBody, resetMilvusQuery>,
  res: ApiResponseType<any>
): Promise<resetMilvusResponse> {
  await authCert({ req, authRoot: true });

  // 删除 milvus DatasetVectorTableName 表
  const milvus = new MilvusCtrl();
  const client = await milvus.getClient();
  await client.dropCollection({
    collection_name: DatasetVectorTableName
  });
  await milvus.init();

  const datasets = await MongoDataset.find({}, '_id name teamId tmbId vectorModel').lean();

  let dataLength = 0;
  const rebuild = async (dataset: DatasetSchemaType, retry = 3) => {
    try {
      return mongoSessionRun(async (session) => {
        // 更新数据状态进入重建
        const data = await MongoDatasetData.updateMany(
          {
            teamId: dataset.teamId,
            datasetId: dataset._id
          },
          {
            $set: {
              rebuilding: true
            }
          },
          {
            session
          }
        );
        dataLength += data.matchedCount;

        // 插入数据进入训练库
        const max = global.systemEnv?.vectorMaxProcess || 10;
        const arr = new Array(max * 2).fill(0);

        for await (const _ of arr) {
          try {
            const hasNext = await mongoSessionRun(async (session) => {
              // get next dataset.data
              const data = await MongoDatasetData.findOneAndUpdate(
                {
                  rebuilding: true
                },
                {
                  $unset: {
                    rebuilding: null
                  },
                  updateTime: new Date()
                },
                {
                  session
                }
              ).select({
                _id: 1,
                collectionId: 1,
                teamId: 1,
                tmbId: 1,
                datasetId: 1
              });

              if (data) {
                await MongoDatasetTraining.create(
                  [
                    {
                      teamId: dataset.teamId,
                      tmbId: dataset.tmbId,
                      datasetId: dataset._id,
                      collectionId: data.collectionId,
                      mode: TrainingModeEnum.chunk,
                      model: dataset.vectorModel,
                      dataId: data._id
                    }
                  ],
                  {
                    session
                  }
                );
              }

              return !!data;
            });

            if (!hasNext) {
              break;
            }
          } catch (error) {
            console.log(error, '=');
          }
        }
      });
    } catch (error) {
      console.log(error);
      await delay(500);
      if (retry > 0) {
        return rebuild(dataset, retry - 1);
      }
    }
  };

  // 重置所有集合进入 rebuild 状态
  (async () => {
    for await (const dataset of datasets) {
      await rebuild(dataset);
    }
    startTrainingQueue();
    console.log('Total reset length:', dataLength);
  })();

  return {};
}

export default NextAPI(handler);
