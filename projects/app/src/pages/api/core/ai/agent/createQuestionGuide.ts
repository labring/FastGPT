import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { CreateQuestionGuideProps } from '@/api/core/ai/agent/type';
import { pushQuestionGuideBill } from '@/service/common/bill/push';
import { defaultQGModel } from '@/pages/api/system/getInitData';
import { createQuestionGuide } from '@fastgpt/core/ai/functions/createQuestionGuide';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { messages } = req.body as CreateQuestionGuideProps;
    const { user } = await authUser({
      req,
      authOutLink: true,
      authToken: true,
      authApiKey: true,
      authBalance: true
    });

    if (!user) {
      throw new Error('user not found');
    }

    const { result, tokens } = await createQuestionGuide({
      messages,
      model: (global.qgModel || defaultQGModel).model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideBill({
      tokens: tokens,
      userId: user._id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
