import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { CreateQuestionGuideProps } from '@/api/core/ai/agent/type';
import { getAIChatApi } from '@fastgpt/core/aiApi/config';
import { Prompt_QuestionGuide } from '@/prompts/core/agent';
import { pushQuestionGuideBill } from '@/service/common/bill/push';
import { defaultQGModel } from '@/pages/api/system/getInitData';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { messages } = req.body as CreateQuestionGuideProps;
    const { user } = await authUser({ req, authToken: true, authApiKey: true, authBalance: true });

    if (!user) {
      throw new Error('user not found');
    }
    const qgModel = global.qgModel || defaultQGModel;

    const chatAPI = getAIChatApi(user.openaiAccount);

    const { data } = await chatAPI.createChatCompletion({
      model: qgModel.model,
      temperature: 0,
      max_tokens: 200,
      messages: [
        ...messages,
        {
          role: 'user',
          content: Prompt_QuestionGuide
        }
      ],
      stream: false
    });

    const answer = data.choices?.[0].message?.content || '';
    const totalTokens = data.usage?.total_tokens || 0;

    const start = answer.indexOf('[');
    const end = answer.lastIndexOf(']');

    if (start === -1 || end === -1) {
      return jsonRes(res, {
        data: []
      });
    }

    const jsonStr = answer
      .substring(start, end + 1)
      .replace(/(\\n|\\)/g, '')
      .replace(/  /g, '');

    try {
      jsonRes(res, {
        data: JSON.parse(jsonStr)
      });

      pushQuestionGuideBill({
        tokens: totalTokens,
        userId: user._id
      });

      return;
    } catch (error) {
      return jsonRes(res, {
        data: []
      });
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
