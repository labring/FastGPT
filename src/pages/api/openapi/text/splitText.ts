import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData } from '@/service/mongo';
import { authKb, authUser } from '@/service/utils/auth';
import { generateVector } from '@/service/events/generateVector';
import { generateQA } from '@/service/events/generateQA';
import { insertKbItem } from '@/service/pg';
import { SplitTextTypEnum } from '@/constants/plugin';
import { withNextCors } from '@/service/utils/tools';

/* split text */
export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chunks, kbId, prompt, mode } = req.body as {
      kbId: string;
      chunks: string[];
      prompt: string;
      mode: `${SplitTextTypEnum}`;
    };
    if (!chunks || !kbId || !prompt) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { userId } = await authUser({ req });

    // 验证是否是该用户的 model
    await authKb({
      kbId,
      userId
    });

    if (mode === SplitTextTypEnum.qa) {
      // 批量QA拆分插入数据
      await SplitData.create({
        userId,
        kbId,
        textList: chunks,
        prompt
      });

      generateQA();
    } else if (mode === SplitTextTypEnum.subsection) {
      // 待优化，直接调用另一个接口
      // 插入记录
      await insertKbItem({
        userId,
        kbId,
        data: chunks.map((item) => ({
          q: item,
          a: ''
        }))
      });

      generateVector();
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};
