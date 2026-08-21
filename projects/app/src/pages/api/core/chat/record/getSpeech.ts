import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';

import { text2Speech } from '@fastgpt/service/core/ai/audio/speech';
import { pushAudioSpeechUsage } from '@/service/support/wallet/usage/push';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { authType2UsageSource } from '@/service/support/wallet/usage/utils';
import { getTTSModel, assertModelUsable } from '@fastgpt/service/core/ai/model/cache';
import { resolveModelId } from '@fastgpt/service/core/ai/compat/resolveModelId';
import { MongoTTSBuffer } from '@fastgpt/service/common/buffer/tts/schema';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { GetChatSpeechBodySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

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

    const { teamId, tmbId, authType } = await authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      outLinkAuthData
    });

    // ⚠️ 热升级兼容：`modelId ?? resolveModelId(legacy model, teamId)`（热升级技术分析 §6.6）。
    // legacy-only 配置传 provider 模型名，resolveModelId 解析为 modelId（或保持原名 → getter 按名解析）。
    const modelId =
      ttsConfig.modelId || (ttsConfig.model ? resolveModelId(ttsConfig.model, teamId) : '');
    if (!modelId || !ttsConfig.voice) {
      throw new Error('model or voice not found');
    }

    // Fail fast at parameter validation (F2-S3-TC06) — existence + active in one
    // shot, before voice lookup and the buffer query. The runtime guard in
    // text2Speech stays as the effect-boundary backstop for all callers.
    const ttsModel = assertModelUsable(getTTSModel(modelId));
    const voiceData = ttsModel.voices?.find((item) => item.value === ttsConfig.voice);

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
      modelData: ttsModel,
      voice: ttsConfig.voice,
      speed: ttsConfig.speed,
      onSuccess: async ({ model, buffer }) => {
        try {
          /* bill */
          pushAudioSpeechUsage({
            modelId: ttsModel.id,
            charsLength: input.length,
            tmbId,
            teamId,
            source: authType2UsageSource({ authType })
          });

          /* create buffer */
          await MongoTTSBuffer.create(
            {
              bufferId,
              text: JSON.stringify({ text: input, speed: ttsConfig.speed }),
              buffer
            },
            {}
          );
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
