import { openaiAccountError } from '../errorCode';
import { insertKbItem } from '@/service/pg';
import { openaiEmbedding } from '@/pages/api/openapi/plugin/openaiEmbedding';
import { TrainingData } from '../models/trainingData';
import { ERROR_ENUM } from '../errorCode';
import { TrainingModeEnum } from '@/constants/plugin';
import { sendInform } from '@/pages/api/user/inform/send';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  if (global.vectorQueueLen >= global.systemEnv.vectorMaxProcess) return;
  global.vectorQueueLen++;

  let trainingId = '';
  let userId = '';

  try {
    const data = await TrainingData.findOneAndUpdate(
      {
        mode: TrainingModeEnum.index,
        lockTime: { $lte: new Date(Date.now() - 2 * 60 * 1000) }
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
      source: 1
    });

    // task preemption
    if (!data) {
      reduceQueue();
      global.vectorQueueLen <= 0 && console.log(`没有需要【索引】的数据, ${global.vectorQueueLen}`);
      return;
    }

    trainingId = data._id;
    userId = String(data.userId);
    const kbId = String(data.kbId);

    const dataItems = [
      {
        q: data.q,
        a: data.a
      }
    ];

    // 生成词向量
    const vectors = await openaiEmbedding({
      input: dataItems.map((item) => item.q),
      userId,
      type: 'training',
      mustPay: true
    });

    // 生成结果插入到 pg
    await insertKbItem({
      userId,
      kbId,
      data: vectors.map((vector, i) => ({
        q: dataItems[i].q,
        a: dataItems[i].a,
        source: data.source,
        vector
      }))
    });

    // delete data from training
    await TrainingData.findByIdAndDelete(data._id);
    console.log(`生成向量成功: ${data._id}`);

    reduceQueue();
    generateVector();
  } catch (err: any) {
    reduceQueue();
    // log
    if (err?.response) {
      console.log('openai error: 生成向量错误');
      console.log(err.response?.status, err.response?.statusText, err.response?.data);
    } else {
      console.log('生成向量错误:', err);
    }

    // message error or openai account error
    if (
      err?.message === 'invalid message format' ||
      err.response?.statusText === 'Unauthorized' ||
      openaiAccountError[err?.response?.data?.error?.code || err?.response?.data?.error?.type]
    ) {
      console.log('删除一个任务');
      await TrainingData.findByIdAndRemove(trainingId);
    }

    // 账号余额不足，删除任务
    if (userId && err === ERROR_ENUM.insufficientQuota) {
      sendInform({
        type: 'system',
        title: '索引生成任务中止',
        content: '由于账号余额不足，索引生成任务中止，重新充值后将会继续。',
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
      return generateVector();
    }

    // unlock
    err.response?.statusText !== 'Too Many Requests' &&
      (await TrainingData.findByIdAndUpdate(trainingId, {
        lockTime: new Date('2000/1/1')
      }));

    setTimeout(() => {
      generateVector();
    }, 1000);
  }
}
