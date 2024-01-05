import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateQuestionGuideParams } from '@/global/core/ai/api.d';
import { pushQuestionGuideBill } from '@/service/support/wallet/bill/push';
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

    const qgModel = global.qgModels[0];

    const { result, inputTokens, outputTokens } = await createQuestionGuide({
      messages,
      model: qgModel.model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideBill({
      inputTokens,
      outputTokens,
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
