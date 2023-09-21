import { insertData2Dataset } from '@/service/pg';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { TrainingData } from '../models/trainingData';
import { ERROR_ENUM } from '../errorCode';
import { TrainingModeEnum } from '@/constants/plugin';
import { sendInform } from '@/pages/api/user/inform/send';
import { addLog } from '../utils/tools';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  if (global.vectorQueueLen >= global.systemEnv.vectorMaxProcess) return;
  global.vectorQueueLen++;

  let trainingId = '';
  let userId = '';
  let dataItems: {
    q: string;
    a: string;
  }[] = [];

  try {
    const data = await TrainingData.findOneAndUpdate(
      {
        mode: TrainingModeEnum.index,
        lockTime: { $lte: new Date(Date.now() - 1 * 60 * 1000) }
      },
      {
        lockTime: new Date()
      }
    ).select({
      _id: 1,
      userId: 1,
      kbId: 1,
      q: 1,
      a: 1,
      source: 1,
      file_id: 1,
      vectorModel: 1,
      billId: 1
    });

    // task preemption
    if (!data) {
      reduceQueue();
      global.vectorQueueLen <= 0 && console.log(`【索引】任务完成`);
      return;
    }

    trainingId = data._id;
    userId = String(data.userId);
    const kbId = String(data.kbId);

    dataItems = [
      {
        q: data.q.replace(/[\x00-\x08]/g, ' '),
        a: data.a.replace(/[\x00-\x08]/g, ' ')
      }
    ];

    // 生成词向量
    const { vectors } = await getVector({
      model: data.vectorModel,
      input: dataItems.map((item) => item.q),
      userId,
      billId: data.billId
    });

    // 生成结果插入到 pg
    await insertData2Dataset({
      userId,
      kbId,
      data: vectors.map((vector, i) => ({
        q: dataItems[i].q,
        a: dataItems[i].a,
        source: data.source,
        file_id: data.file_id,
        vector
      }))
    });

    // delete data from training
    await TrainingData.findByIdAndDelete(data._id);
    // console.log(`生成向量成功: ${data._id}`);

    reduceQueue();
    generateVector();
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
      addLog.error('openai error: 生成向量错误', err);
    }

    // message error or openai account error
    if (
      err?.message === 'invalid message format' ||
      err.response?.data?.error?.type === 'invalid_request_error'
    ) {
      addLog.info('invalid message format', {
        dataItems
      });
      try {
        await TrainingData.findByIdAndUpdate(trainingId, {
          lockTime: new Date('2998/5/5')
        });
      } catch (error) {}
      return generateVector();
    }

    // err vector data
    if (err?.code === 500) {
      await TrainingData.findByIdAndDelete(trainingId);
      return generateVector();
    }

    // 账号余额不足，删除任务
    if (userId && err === ERROR_ENUM.insufficientQuota) {
      try {
        sendInform({
          type: 'system',
          title: '索引生成任务中止',
          content:
            '由于账号余额不足，索引生成任务中止，重新充值后将会继续。暂停的任务将在 7 天后被删除。',
          userId
        });
        console.log('余额不足，暂停向量生成任务');
        await TrainingData.updateMany(
          {
            userId
          },
          {
            lockTime: new Date('2999/5/5')
          }
        );
      } catch (error) {}
      return generateVector();
    }

    setTimeout(() => {
      generateVector();
    }, 1000);
  }
}
