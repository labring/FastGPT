import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { authKb } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { PgDatasetTableName, TrainingModeEnum } from '@/constants/plugin';
import { startQueue } from '@/service/utils/tools';
import { PgClient } from '@/service/pg';
import { getVectorModel } from '@/service/utils/data';
import { DatasetDataItemType } from '@/types/core/dataset/data';
import { countPromptTokens } from '@/utils/common/tiktoken';
import type { PushDataProps, PushDataResponse } from '@/api/core/dataset/data.d';

const modeMap = {
  [TrainingModeEnum.index]: true,
  [TrainingModeEnum.qa]: true
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { kbId, data, mode = TrainingModeEnum.index } = req.body as PushDataProps;

    if (!kbId || !Array.isArray(data)) {
      throw new Error('KbId or data is empty');
    }

    if (modeMap[mode] === undefined) {
      throw new Error('Mode is error');
    }

    if (data.length > 500) {
      throw new Error('Data is too long, max 500');
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true, authApiKey: true });

    jsonRes<PushDataResponse>(res, {
      data: await pushDataToKb({
        ...req.body,
        userId
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
  billId
}: { userId: string } & PushDataProps): Promise<PushDataResponse> {
  const [kb, vectorModel] = await Promise.all([
    authKb({
      userId,
      kbId
    }),
    (async () => {
      if (mode === TrainingModeEnum.index) {
        const vectorModel = (await KB.findById(kbId, 'vectorModel'))?.vectorModel;

        return getVectorModel(vectorModel || global.vectorModels[0].model);
      }
      return global.vectorModels[0];
    })()
  ]);

  const modeMaxToken = {
    [TrainingModeEnum.index]: vectorModel.maxToken * 1.5,
    [TrainingModeEnum.qa]: global.qaModel.maxToken * 0.8
  };

  // 过滤重复的 qa 内容
  const set = new Set();
  const filterData: DatasetDataItemType[] = [];

  data.forEach((item) => {
    if (!item.q) return;

    const text = item.q + item.a;

    // count q token
    const token = countPromptTokens(item.q, 'system');

    if (token > modeMaxToken[mode]) {
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
      filterData.map(async (data) => {
        let { q, a } = data;
        if (mode !== TrainingModeEnum.index) {
          return Promise.resolve(data);
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
            FROM  ${PgDatasetTableName} 
            WHERE md5(q)=md5('${q}') AND md5(a)=md5('${a}') AND user_id='${userId}' AND kb_id='${kbId}'
          `);
          const exists = rows[0]?.exists || false;

          if (exists) {
            return Promise.reject('已经存在');
          }
        } catch (error) {
          console.log(error);
        }
        return Promise.resolve(data);
      })
    )
  )
    .filter((item) => item.status === 'fulfilled')
    .map<DatasetDataItemType>((item: any) => item.value);

  // 插入记录
  const insertRes = await TrainingData.insertMany(
    insertData.map((item) => ({
      ...item,
      userId,
      kbId,
      mode,
      prompt,
      billId,
      vectorModel: vectorModel.model
    }))
  );

  insertRes.length > 0 && startQueue();

  return {
    insertLen: insertRes.length
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
