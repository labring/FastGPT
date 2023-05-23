import { getApiKey } from '../utils/auth';
import { openaiError2 } from '../errorCode';
import { PgClient } from '@/service/pg';
import { getErrText } from '@/utils/tools';
import { openaiEmbedding } from '@/pages/api/openapi/plugin/openaiEmbedding';

export async function generateVector(next = false): Promise<any> {
  if (process.env.queueTask !== '1') {
    try {
      fetch(process.env.parentUrl || '');
    } catch (error) {
      console.log('parentUrl fetch error', error);
    }
    return;
  }

  if (global.generatingVector && !next) return;

  global.generatingVector = true;
  let dataId = null;

  try {
    // 从找出一个 status = waiting 的数据
    const searchRes = await PgClient.select('modelData', {
      fields: ['id', 'q', 'user_id'],
      where: [['status', 'waiting']],
      limit: 1
    });

    if (searchRes.rowCount === 0) {
      console.log('没有需要生成 【向量】 的数据');
      global.generatingVector = false;
      return;
    }

    const dataItem: { id: string; q: string; userId: string } = {
      id: searchRes.rows[0].id,
      q: searchRes.rows[0].q,
      userId: searchRes.rows[0].user_id
    };

    dataId = dataItem.id;

    // 获取 openapi Key
    try {
      await getApiKey({ model: 'gpt-3.5-turbo', userId: dataItem.userId });
    } catch (err: any) {
      await PgClient.delete('modelData', {
        where: [['id', dataId]]
      });
      getErrText(err, '获取 OpenAi Key 失败');
      return generateVector(true);
    }

    // 生成词向量
    const vectors = await openaiEmbedding({
      input: [dataItem.q],
      userId: dataItem.userId
    });

    // 更新 pg 向量和状态数据
    await PgClient.update('modelData', {
      values: [
        { key: 'vector', value: `[${vectors[0]}]` },
        { key: 'status', value: `ready` }
      ],
      where: [['id', dataId]]
    });

    console.log(`生成向量成功: ${dataItem.id}`);

    generateVector(true);
  } catch (error: any) {
    // log
    if (error?.response) {
      console.log('openai error: 生成向量错误');
      console.log(error.response?.status, error.response?.statusText, error.response?.data);
    } else {
      console.log('生成向量错误:', error);
    }

    // 没有余额或者凭证错误时，拒绝任务
    if (dataId && openaiError2[error?.response?.data?.error?.type]) {
      console.log('删除向量生成任务记录');
      try {
        await PgClient.delete('modelData', {
          where: [['id', dataId]]
        });
      } catch (error) {
        error;
      }
      generateVector(true);
      return;
    }
    if (error?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，1分钟后尝试');
      // 限制次数，1分钟后再试
      setTimeout(() => {
        generateVector(true);
      }, 60000);
      return;
    }
    setTimeout(() => {
      generateVector(true);
    }, 1000);
  }
}
