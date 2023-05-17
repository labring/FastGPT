import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData } from '@/service/mongo';
import { authKb, authToken } from '@/service/utils/auth';
import { generateVector } from '@/service/events/generateVector';
import { generateQA } from '@/service/events/generateQA';
import { PgClient } from '@/service/pg';
import { SplitTextTypEnum } from '@/constants/plugin';

/* split text */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    const userId = await authToken(req);

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
      await PgClient.insert('modelData', {
        values: chunks.map((item) => [
          { key: 'user_id', value: userId },
          { key: 'kb_id', value: kbId },
          { key: 'q', value: item },
          { key: 'a', value: '' },
          { key: 'status', value: 'waiting' }
        ])
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
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};
