import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { authKb } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { PgTrainingTableName, TrainingModeEnum } from '@/constants/plugin';
import { startQueue } from '@/service/utils/tools';
import { PgClient } from '@/service/pg';
import { modelToolMap } from '@/utils/plugin';

export type DateItemType = { a: string; q: string; source?: string };

export type Props = {
  kbId: string;
  data: DateItemType[];
  model: string;
  mode: `${TrainingModeEnum}`;
  prompt?: string;
};

export type Response = {
  insertLen: number;
};

const modeMaxToken = {
  [TrainingModeEnum.index]: 6000,
  [TrainingModeEnum.qa]: 12000
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { kbId, data, mode, prompt, model } = req.body as Props;

    if (!kbId || !Array.isArray(data) || !model) {
      throw new Error('缺少参数');
    }

    // auth model
    if (mode === TrainingModeEnum.qa && !global.qaModels.find((item) => item.model === model)) {
      throw new Error('不支持的 QA 拆分模型');
    }
    if (
      mode === TrainingModeEnum.index &&
      !global.vectorModels.find((item) => item.model === model)
    ) {
      throw new Error('不支持的向量生成模型');
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req });

    jsonRes<Response>(res, {
      data: await pushDataToKb({
        kbId,
        data,
        userId,
        mode,
        prompt,
        model
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function pushDataToKb({
  userId,
  kbId,
  data,
  mode,
  prompt,
  model
}: { userId: string } & Props): Promise<Response> {
  await authKb({
    userId,
    kbId
  });

  // 过滤重复的 qa 内容
  const set = new Set();
  const filterData: DateItemType[] = [];

  data.forEach((item) => {
    const text = item.q + item.a;

    // count token
    const token = modelToolMap.countTokens({
      model: 'gpt-3.5-turbo',
      messages: [{ obj: 'System', value: item.q }]
    });

    if (token > modeMaxToken[TrainingModeEnum.qa]) {
      return;
    }

    if (!set.has(text)) {
      filterData.push(item);
      set.add(text);
    }
  });

  // 数据库去重
  const insertData = (
    await Promise.allSettled(
      filterData.map(async ({ q, a = '', source }) => {
        if (mode !== TrainingModeEnum.index) {
          return Promise.resolve({
            q,
            a,
            source
          });
        }

        if (!q) {
          return Promise.reject('q为空');
        }

        q = q.replace(/\\n/g, '\n').trim().replace(/'/g, '"');
        a = a.replace(/\\n/g, '\n').trim().replace(/'/g, '"');

        // Exactly the same data, not push
        try {
          const { rows } = await PgClient.query(`
            SELECT COUNT(*) > 0 AS exists
            FROM  ${PgTrainingTableName} 
            WHERE md5(q)=md5('${q}') AND md5(a)=md5('${a}') AND user_id='${userId}' AND kb_id='${kbId}'
          `);
          const exists = rows[0]?.exists || false;

          if (exists) {
            return Promise.reject('已经存在');
          }
        } catch (error) {
          console.log(error);
          error;
        }
        return Promise.resolve({
          q,
          a,
          source
        });
      })
    )
  )
    .filter((item) => item.status === 'fulfilled')
    .map<DateItemType>((item: any) => item.value);

  // 插入记录
  await TrainingData.insertMany(
    insertData.map((item) => ({
      q: item.q,
      a: item.a,
      model,
      source: item.source,
      userId,
      kbId,
      mode,
      prompt
    }))
  );

  insertData.length > 0 && startQueue();

  return {
    insertLen: insertData.length
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    }
  }
};
