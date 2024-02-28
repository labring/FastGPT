import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateQuestionGuideParams } from '@/global/core/ai/api.d';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authCertOrShareId } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { messages, shareId } = req.body as CreateQuestionGuideParams;

    const { tmbId, teamId } = await authCertOrShareId({
      req,
      authToken: true,
      shareId
    });

    const qgModel = global.llmModels[0];

    const { result, charsLength } = await createQuestionGuide({
      messages,
      model: qgModel.model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideUsage({
      charsLength,
      teamId,
      tmbId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
