import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { sendOneInform } from '../support/user/inform/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { lockTrainingDataByTeamId } from '@fastgpt/service/core/dataset/training/controller';

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
  try {
    await authTeamBalance(data.teamId);
  } catch (error: any) {
    if (error?.statusText === UserErrEnum.balanceNotEnough) {
      // send inform and lock data
      try {
        sendOneInform({
          type: 'system',
          title: '文本训练任务中止',
          content:
            '该团队账号余额不足，文本训练任务中止，重新充值后将会继续。暂停的任务将在 7 天后被删除。',
          tmbId: data.tmbId
        });
        console.log('余额不足，暂停【向量】生成任务');
        lockTrainingDataByTeamId(data.teamId);
      } catch (error) {}
    }

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

    // insert data to pg
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

    // push bill
    pushGenerateVectorBill({
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
    // log
    if (err?.response) {
      addLog.info('openai error: 生成向量错误', {
        status: err.response?.status,
        stateusText: err.response?.statusText,
        data: err.response?.data
      });
    } else {
      console.log(err);
      addLog.error(getErrText(err, '生成向量错误'));
    }

    // message error or openai account error
    if (
      err?.message === 'invalid message format' ||
      err.response?.data?.error?.type === 'invalid_request_error' ||
      err?.code === 500
    ) {
      addLog.info('Lock training data');
      console.log(err?.code);
      console.log(err.response?.data?.error?.type);
      console.log(err?.message);

      try {
        await MongoDatasetTraining.findByIdAndUpdate(data._id, {
          lockTime: new Date('2998/5/5')
        });
      } catch (error) {}
      return generateVector();
    }

    setTimeout(() => {
      generateVector();
    }, 1000);
  }
}
