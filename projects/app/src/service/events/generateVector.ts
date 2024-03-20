import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { checkInvalidChunkAndLock } from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import { addLog } from '@fastgpt/service/common/system/log';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  if (global.vectorQueueLen >= max) return;
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
          mode: TrainingModeEnum.chunk,
          lockTime: { $lte: addMinutes(new Date(), -1) }
        },
        {
          lockTime: new Date()
        }
      ).select({
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
      });

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
      addLog.error(`Get Training Data error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[Vector Queue] Done`);
    }
    return;
  }
  if (error) {
    addLog.error(`[Vector Queue] Error`, { error });
    reduceQueue();
    return generateVector();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId, data.tmbId))) {
    reduceQueue();
    return generateVector();
  }

  addLog.info(`[Vector Queue] Start`);

  // create vector and insert
  try {
    // invalid data
    if (!data.q.trim()) {
      await data.deleteOne();
      reduceQueue();
      generateVector();
      return;
    }

    // insert to dataset
    const { tokens } = await insertData2Dataset({
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
      tokens,
      model: data.model,
      billId: data.billId
    });

    // delete data from training
    await data.deleteOne();
    reduceQueue();
    generateVector();

    addLog.info(`[Vector Queue] Finish`, {
      time: Date.now() - start
    });
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
