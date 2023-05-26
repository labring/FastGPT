import type { NextApiRequest, NextApiResponse } from 'next';
import type { KbDataItemType } from '@/types/plugin';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { generateVector } from '@/service/events/generateVector';
import { PgClient } from '@/service/pg';
import { authKb } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';

interface Props {
  kbId: string;
  data: { a: KbDataItemType['a']; q: KbDataItemType['q'] }[];
}

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { kbId, data } = req.body as Props;

    if (!kbId || !Array.isArray(data)) {
      throw new Error('缺少参数');
    }
    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req });

    jsonRes(res, {
      data: await pushDataToKb({
        kbId,
        data,
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

export async function pushDataToKb({ userId, kbId, data }: { userId: string } & Props) {
  await authKb({
    userId,
    kbId
  });

  if (data.length === 0) {
    return {
      trainingId: ''
    };
  }

  // 插入记录
  const { _id } = await TrainingData.create({
    userId,
    kbId,
    vectorList: data
  });

  generateVector(_id);

  return {
    trainingId: _id
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};
