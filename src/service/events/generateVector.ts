import { openaiError2 } from '../errorCode';
import { insertKbItem, PgClient } from '@/service/pg';
import { openaiEmbedding } from '@/pages/api/openapi/plugin/openaiEmbedding';
import { TrainingData } from '../models/trainingData';
import { ERROR_ENUM } from '../errorCode';
import { TrainingTypeEnum } from '@/constants/plugin';

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const maxProcess = Number(process.env.VECTOR_MAX_PROCESS || 10);

  if (global.vectorQueueLen >= maxProcess) return;
  global.vectorQueueLen++;

  let trainingId = '';
  let userId = '';

  try {
    const data = await TrainingData.findOneAndUpdate(
      {
        mode: TrainingTypeEnum.index,
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
      a: 1
    });

    /* 无待生成的任务 */
    if (!data) {
      global.vectorQueueLen--;
      !global.vectorQueueLen && console.log(`没有需要【索引】的数据`);
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

    // 过滤重复的 qa 内容
    // const searchRes = await Promise.allSettled(
    //   dataItems.map(async ({ q, a = '' }) => {
    //     if (!q) {
    //       return Promise.reject('q为空');
    //     }

    //     q = q.replace(/\\n/g, '\n');
    //     a = a.replace(/\\n/g, '\n');

    //     // Exactly the same data, not push
    //     try {
    //       const count = await PgClient.count('modelData', {
    //         where: [['user_id', userId], 'AND', ['kb_id', kbId], 'AND', ['q', q], 'AND', ['a', a]]
    //       });

    //       if (count > 0) {
    //         return Promise.reject('已经存在');
    //       }
    //     } catch (error) {
    //       error;
    //     }
    //     return Promise.resolve({
    //       q,
    //       a
    //     });
    //   })
    // );
    // const filterData = searchRes
    //   .filter((item) => item.status === 'fulfilled')
    //   .map<{ q: string; a: string }>((item: any) => item.value);

    // 生成词向量
    const vectors = await openaiEmbedding({
      input: dataItems.map((item) => item.q),
      userId,
      type: 'training'
    });

    // 生成结果插入到 pg
    await insertKbItem({
      userId,
      kbId,
      data: vectors.map((vector, i) => ({
        q: dataItems[i].q,
        a: dataItems[i].a,
        vector
      }))
    });

    // delete data from training
    await TrainingData.findByIdAndDelete(data._id);
    console.log(`生成向量成功: ${data._id}`);

    global.vectorQueueLen--;
    generateVector();
  } catch (err: any) {
    // log
    if (err?.response) {
      console.log('openai error: 生成向量错误');
      console.log(err.response?.status, err.response?.statusText, err.response?.data);
    } else {
      console.log('生成向量错误:', err);
    }

    // openai 账号异常或者账号余额不足，删除任务
    if (openaiError2[err?.response?.data?.error?.type] || err === ERROR_ENUM.insufficientQuota) {
      console.log('余额不足，删除向量生成任务');
      await TrainingData.deleteMany({
        userId
      });
      return generateVector();
    }

    // unlock
    global.vectorQueueLen--;
    await TrainingData.findByIdAndUpdate(trainingId, {
      lockTime: new Date('2000/1/1')
    });

    // 频率限制
    if (err?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，20s后尝试');
      return setTimeout(() => {
        generateVector();
      }, 20000);
    }

    setTimeout(() => {
      generateVector();
    }, 1000);
  }
}
