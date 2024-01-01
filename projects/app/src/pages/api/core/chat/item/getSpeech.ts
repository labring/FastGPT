import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { GetChatSpeechProps } from '@/global/core/chat/api.d';
import { text2Speech } from '@fastgpt/service/core/ai/audio/speech';
import { pushAudioSpeechBill } from '@/service/support/wallet/bill/push';
import { authCertOrShareId } from '@fastgpt/service/support/permission/auth/common';
import { authType2BillSource } from '@/service/support/wallet/bill/utils';
import { getAudioSpeechModel } from '@/service/core/ai/model';
import { MongoTTSBuffer } from '@fastgpt/service/common/buffer/tts/schema';

/* 
1. get tts from chatItem store
2. get tts from ai
3. save tts to chatItem store if chatItemId is provided
4. push bill
*/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { ttsConfig, input, shareId } = req.body as GetChatSpeechProps;

    if (!ttsConfig.model || !ttsConfig.voice) {
      throw new Error('model or voice not found');
    }

    const { teamId, tmbId, authType } = await authCertOrShareId({ req, authToken: true, shareId });

    const ttsModel = getAudioSpeechModel(ttsConfig.model);
    const voiceData = ttsModel.voices?.find((item) => item.value === ttsConfig.voice);

    if (!voiceData) {
      throw new Error('voice not found');
    }

    const ttsBuffer = await MongoTTSBuffer.findOne(
      {
        bufferId: voiceData.bufferId,
        text: JSON.stringify({ text: input, speed: ttsConfig.speed })
      },
      'buffer'
    );

    if (ttsBuffer?.buffer) {
      return res.end(new Uint8Array(ttsBuffer.buffer.buffer));
    }

    await text2Speech({
      res,
      input,
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      speed: ttsConfig.speed,
      onSuccess: async ({ model, buffer }) => {
        try {
          pushAudioSpeechBill({
            model: model,
            textLen: input.length,
            tmbId,
            teamId,
            source: authType2BillSource({ authType })
          });

          await MongoTTSBuffer.create({
            bufferId: voiceData.bufferId,
            text: JSON.stringify({ text: input, speed: ttsConfig.speed }),
            buffer
          });
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
