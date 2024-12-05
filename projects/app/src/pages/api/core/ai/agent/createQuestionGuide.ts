import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';

async function handler(
  req: ApiRequestProps<
    OutLinkChatAuthProps & {
      messages: ChatCompletionMessageParam[];
    }
  >,
  res: NextApiResponse<any>
) {
  try {
    await connectToDatabase();
    const { messages } = req.body;

    const { tmbId, teamId } = await authChatCert({
      req,
      authToken: true,
      authApiKey: true
    });

    const qgModel = global.llmModels[0];

    const { result, tokens } = await createQuestionGuide({
      messages,
      model: qgModel.model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideUsage({
      tokens,
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

export default NextAPI(handler);
