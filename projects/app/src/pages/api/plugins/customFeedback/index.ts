import type { NextApiRequest, NextApiResponse } from 'next';
import type { HttpBodyType } from '@fastgpt/global/core/module/api.d';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { addCustomFeedbacks } from '@fastgpt/service/core/chat/controller';

type Props = HttpBodyType<{
  defaultFeedback: string;
  customFeedback: string;
}>;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      chatId,
      responseChatItemId: chatItemId,
      data: { defaultFeedback, customFeedback }
    } = req.body as Props;

    const feedback = customFeedback || defaultFeedback;

    if (!feedback) {
      return res.json({
        response: ''
      });
    }

    // wait the chat finish
    setTimeout(() => {
      addCustomFeedbacks({
        chatId,
        chatItemId,
        feedbacks: [feedback]
      });
    }, 60000);

    if (!chatId || !chatItemId) {
      return res.json({
        response: `\n------\n自动反馈调试: ${feedback}\n\n`
      });
    }

    return res.json({
      response: ''
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
