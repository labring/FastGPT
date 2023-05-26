import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authKb, authUser } from '@/service/utils/auth';
import { generateQA } from '@/service/events/generateQA';
import { TrainingTypeEnum } from '@/constants/plugin';
import { withNextCors } from '@/service/utils/tools';
import { pushDataToKb } from '../kb/pushData';

/* split text */
export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chunks, kbId, prompt, mode } = req.body as {
      kbId: string;
      chunks: string[];
      prompt: string;
      mode: `${TrainingTypeEnum}`;
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

    if (mode === TrainingTypeEnum.qa) {
      // 批量QA拆分插入数据
      const { _id } = await TrainingData.create({
        userId,
        kbId,
        qaList: chunks,
        prompt
      });
      generateQA(_id);
    } else if (mode === TrainingTypeEnum.subsection) {
      // 分段导入，直接插入向量队列
      const response = await pushDataToKb({
        kbId,
        data: chunks.map((item) => ({ q: item, a: '' })),
        userId
      });

      return jsonRes(res, {
        data: response
      });
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
