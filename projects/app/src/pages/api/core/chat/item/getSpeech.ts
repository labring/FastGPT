import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { GetChatSpeechProps } from '@/global/core/chat/api.d';
import { text2Speech } from '@fastgpt/service/core/ai/audio/speech';
import { pushAudioSpeechBill } from '@/service/support/wallet/bill/push';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authType2BillSource } from '@/service/support/wallet/bill/utils';

/* 
1. get tts from chatItem store
2. get tts from ai
3. save tts to chatItem store if chatItemId is provided
4. push bill
*/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatItemId, ttsConfig, input } = req.body as GetChatSpeechProps;

    const { teamId, tmbId, authType } = await authCert({ req, authToken: true });

    const chatItem = await (async () => {
      if (!chatItemId) return null;
      return await MongoChatItem.findOne(
        {
          dataId: chatItemId
        },
        'tts'
      );
    })();

    if (chatItem?.tts) {
      return jsonRes(res, {
        data: chatItem.tts
      });
    }

    await text2Speech({
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      input,
      res,
      onSuccess: async ({ model, buffer }) => {
        try {
          pushAudioSpeechBill({
            model: model,
            textLength: input.length,
            tmbId,
            teamId,
            source: authType2BillSource({ authType })
          });

          if (!chatItem) return;
          chatItem.tts = buffer;
          await chatItem.save();
        } catch (error) {}
      },
      onError: (err) => {
        jsonRes(res, {
          code: 500,
          error: err
        });
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
