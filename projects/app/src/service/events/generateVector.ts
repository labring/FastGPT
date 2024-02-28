import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkInvalidChunkAndLock, checkTeamAiPointsAndLock } from './utils';
import { delay } from '@fastgpt/global/common/system/utils';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  if (global.vectorQueueLen >= global.systemEnv.vectorMaxProcess) return;
  global.vectorQueueLen++;
  const start = Date.now();

  // get training data
  const {
    data,
    dataItem,
    done = false,
    error = false
  } = await (async () => {
    try {
      const data = await MongoDatasetTraining.findOneAndUpdate(
        {
          lockTime: { $lte: new Date(Date.now() - 1 * 60 * 1000) },
          mode: TrainingModeEnum.chunk
        },
        {
          lockTime: new Date()
        }
      )
        .sort({
          weight: -1
        })
        .select({
          _id: 1,
          userId: 1,
          teamId: 1,
          tmbId: 1,
          datasetId: 1,
          collectionId: 1,
          q: 1,
          a: 1,
          chunkIndex: 1,
          indexes: 1,
          model: 1,
          billId: 1
        })
        .lean();

      // task preemption
      if (!data) {
        return {
          done: true
        };
      }
      return {
        data,
        dataItem: {
          q: data.q,
          a: data.a || '',
          indexes: data.indexes
        }
      };
    } catch (error) {
      console.log(`Get Training Data error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      console.log(`【index】Task done`);
    }
    return;
  }
  if (error) {
    reduceQueue();
    return generateVector();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId, data.tmbId))) {
    reduceQueue();
    return generateVector();
  }

  // create vector and insert
  try {
    // invalid data
    if (!data.q.trim()) {
      await MongoDatasetTraining.findByIdAndDelete(data._id);
      reduceQueue();
      generateVector();
      return;
    }

    // insert to dataset
    const { charsLength } = await insertData2Dataset({
      teamId: data.teamId,
      tmbId: data.tmbId,
      datasetId: data.datasetId,
      collectionId: data.collectionId,
      q: dataItem.q,
      a: dataItem.a,
      chunkIndex: data.chunkIndex,
      indexes: dataItem.indexes,
      model: data.model
    });

    // push usage
    pushGenerateVectorUsage({
      teamId: data.teamId,
      tmbId: data.tmbId,
      charsLength,
      model: data.model,
      billId: data.billId
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);
    reduceQueue();
    generateVector();

    console.log(`embedding finished, time: ${Date.now() - start}ms`);
  } catch (err: any) {
    reduceQueue();

    if (await checkInvalidChunkAndLock({ err, data, errText: '向量模型调用失败' })) {
      return generateVector();
    }

    setTimeout(() => {
      generateVector();
    }, 1000);
  }
}
