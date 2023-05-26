import { openaiError2 } from '../errorCode';
import { insertKbItem, PgClient } from '@/service/pg';
import { openaiEmbedding } from '@/pages/api/openapi/plugin/openaiEmbedding';
import { TrainingData } from '../models/trainingData';
import { ERROR_ENUM } from '../errorCode';

// 每次最多选 5 组
const listLen = 5;

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(trainingId: string): Promise<any> {
  try {
    // 找出一个需要生成的 dataItem (2分钟锁)
    const data = await TrainingData.findOneAndUpdate(
      {
        _id: trainingId,
        lockTime: { $lte: Date.now() - 2 * 60 * 1000 }
      },
      {
        lockTime: new Date()
      }
    );

    if (!data) {
      await TrainingData.findOneAndDelete({
        _id: trainingId,
        qaList: [],
        vectorList: []
      });
      return;
    }

    const userId = String(data.userId);
    const kbId = String(data.kbId);

    const dataItems: { q: string; a: string }[] = data.vectorList.slice(-listLen).map((item) => ({
      q: item.q,
      a: item.a
    }));

    // 过滤重复的 qa 内容
    const searchRes = await Promise.allSettled(
      dataItems.map(async ({ q, a = '' }) => {
        if (!q) {
          return Promise.reject('q为空');
        }

        q = q.replace(/\\n/g, '\n');
        a = a.replace(/\\n/g, '\n');

        // Exactly the same data, not push
        try {
          const count = await PgClient.count('modelData', {
            where: [['user_id', userId], 'AND', ['kb_id', kbId], 'AND', ['q', q], 'AND', ['a', a]]
          });
          if (count > 0) {
            return Promise.reject('已经存在');
          }
        } catch (error) {
          error;
        }
        return Promise.resolve({
          q,
          a
        });
      })
    );
    const filterData = searchRes
      .filter((item) => item.status === 'fulfilled')
      .map<{ q: string; a: string }>((item: any) => item.value);

    if (filterData.length > 0) {
      // 生成词向量
      const vectors = await openaiEmbedding({
        input: filterData.map((item) => item.q),
        userId,
        type: 'training'
      });

      // 生成结果插入到 pg
      await insertKbItem({
        userId,
        kbId,
        data: vectors.map((vector, i) => ({
          q: filterData[i].q,
          a: filterData[i].a,
          vector
        }))
      });
    }

    // 删除 mongo 训练队列.  如果小于 n 条，整个数据删掉。 如果大于 n 条，仅删数组后 n 个
    if (data.vectorList.length <= listLen) {
      await TrainingData.findByIdAndDelete(trainingId);
      console.log(`全部向量生成完毕: ${trainingId}`);
    } else {
      await TrainingData.findByIdAndUpdate(trainingId, {
        vectorList: data.vectorList.slice(0, -listLen),
        lockTime: new Date('2000/1/1')
      });
      console.log(`生成向量成功: ${trainingId}`);
      generateVector(trainingId);
    }
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
      await TrainingData.findByIdAndDelete(trainingId);
      return;
    }

    // unlock
    await TrainingData.findByIdAndUpdate(trainingId, {
      lockTime: new Date('2000/1/1')
    });

    // 频率限制
    if (err?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，30s后尝试');
      return setTimeout(() => {
        generateVector(trainingId);
      }, 30000);
    }

    setTimeout(() => {
      generateVector(trainingId);
    }, 1000);
  }
}
