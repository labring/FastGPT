import type { NextApiRequest, NextApiResponse } from 'next';
import type { HttpBodyType } from '@fastgpt/global/core/workflow/api.d';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { addCustomFeedbacks } from '@fastgpt/service/core/chat/controller';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type Props = HttpBodyType<{
  customFeedback: string;
}>;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      customFeedback,
      [NodeInputKeyEnum.addInputParam]: { appId, chatId, responseChatItemId: chatItemId }
    } = req.body as Props;

    await authRequestFromLocal({ req });

    if (!customFeedback) {
      return res.json({});
    }

    // wait the chat finish
    setTimeout(() => {
      addCustomFeedbacks({
        appId,
        chatId,
        chatItemId,
        feedbacks: [customFeedback]
      });
    }, 60000);

    if (!chatId || !chatItemId) {
      return res.json({
        [NodeOutputKeyEnum.answerText]: `\\n\\n**自动反馈调试**: "${customFeedback}"\\n\\n`,
        text: customFeedback
      });
    }

    res.json({
      text: customFeedback
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
