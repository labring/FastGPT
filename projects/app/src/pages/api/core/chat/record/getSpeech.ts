import { jsonRes } from '@fastgpt/service/common/response';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import type { NextApiResponse } from 'next';

import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { pushAudioSpeechUsage } from '@/service/support/wallet/usage/push';
import { authType2UsageSource } from '@/service/support/wallet/usage/utils';
import { text2Speech } from '@fastgpt/service/core/ai/audio/speech';

import { GetChatSpeechBodySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { MongoTTSBuffer } from '@fastgpt/service/common/buffer/tts/schema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authTargetModelResource } from '@fastgpt/service/support/permission/app/resource';

/*
1. get tts from chatItem store
2. get tts from ai
4. push bill
*/
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  try {
    const { ttsConfig, input, sourceType, sourceId, outLinkAuthData } = parseApiInput({
      req,
      bodySchema: GetChatSpeechBodySchema
    }).body;

    if ((ttsConfig.modelId === undefined && ttsConfig.model === undefined) || !ttsConfig.voice) {
      throw new Error('model reference or voice not found');
    }

    const {
      teamId,
      tmbId,
      isRoot,
      authType,
      sourceType: resolvedSourceType,
      sourceId: resolvedSourceId
    } = await authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      outLinkAuthData
    });
    const modelHandle = await getTeamModelHandle({ teamId });
    const ttsModel = modelHandle.getTTSModelData({
      modelId: ttsConfig.modelId,
      model: ttsConfig.model
    });
    await authTargetModelResource({
      targetType: resolvedSourceType,
      targetId: resolvedSourceId,
      modelId: ttsModel.modelId,
      teamId,
      tmbId,
      isRoot,
      handle: modelHandle
    });
    const voiceData = ttsModel.config.voices.find((item) => item.value === ttsConfig.voice);

    if (!voiceData) {
      throw new Error('voice not found');
    }

    const bufferId = `${ttsModel.model}-${ttsConfig.voice}`;

    /* get audio from buffer */
    const ttsBuffer = await MongoTTSBuffer.findOne(
      {
        bufferId,
        text: JSON.stringify({ text: input, speed: ttsConfig.speed })
      },
      'buffer'
    );

    if (ttsBuffer?.buffer) {
      return res.end(new Uint8Array(ttsBuffer.buffer.buffer));
    }

    /* request audio */
    await text2Speech({
      res,
      input,
      model: ttsModel,
      voice: ttsConfig.voice,
      speed: ttsConfig.speed,
      onSuccess: async ({ model, buffer }) => {
        try {
          /* bill */
          pushAudioSpeechUsage({
            model: model,
            charsLength: input.length,
            tmbId,
            teamId,
            source: authType2UsageSource({ authType })
          });

          /* create buffer */
          await MongoTTSBuffer.create({
            bufferId,
            text: JSON.stringify({ text: input, speed: ttsConfig.speed }),
            buffer
          });
        } catch {}
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

// 不能使用 NextApiResponse
export default handler;
