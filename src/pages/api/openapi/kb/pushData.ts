import type { NextApiRequest, NextApiResponse } from 'next';
import type { KbDataItemType } from '@/types/plugin';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { authKb } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { TrainingModeEnum } from '@/constants/plugin';
import { startQueue } from '@/service/utils/tools';

export type Props = {
  kbId: string;
  data: { a: KbDataItemType['a']; q: KbDataItemType['q'] }[];
  mode: `${TrainingModeEnum}`;
  prompt?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { kbId, data, mode, prompt } = req.body as Props;

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
        userId,
        mode,
        prompt
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
  prompt
}: { userId: string } & Props) {
  await authKb({
    userId,
    kbId
  });

  if (data.length === 0) {
    return {};
  }

  // 去重
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

  // 插入记录
  await TrainingData.insertMany(
    data.map((item) => ({
      q: item.q,
      a: item.a,
      userId,
      kbId,
      mode,
      prompt
    }))
  );

  startQueue();

  return {};
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    }
  }
};
