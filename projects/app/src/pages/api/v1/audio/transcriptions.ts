import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { jsonRes } from '@fastgpt/service/common/response';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { getSTTBillableUsage } from '@fastgpt/service/core/ai/audio/utils';
import { getSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { pushSTTUsage } from '@fastgpt/service/support/wallet/usage/controller';
import type { NextApiRequest, NextApiResponse } from 'next';

import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AudioTranscriptionsDataSchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { multer } from '@fastgpt/service/common/file/multer';
import {
  ApiRequestInputParseError,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';

/** 解析音频表单并记录有效成员用量；入参错误交由统一入口返回 400，临时文件始终清理。 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({ request: req });
    filepaths.push(result.fileMetadata.path);
    const { customUid, authProxy, sourceType, sourceId, chatId, outLinkAuthData } = parseApiInput({
      req: { body: result.data },
      bodySchema: AudioTranscriptionsDataSchema
    }).body;

    if (!result.fileMetadata) {
      throw new Error('file not found');
    }

    const { teamId, tmbId } = await authChatTargetCrud({
      allowMissingChat: true,
      customUid,
      authProxy,
      req,
      authToken: true,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData
    });
    await assertMemberRateLimit({
      policy: MemberRateLimitPolicy.Transcriptions,
      memberId: String(tmbId)
    });
    const modelHandle = await getSystemModelHandle();
    const model = modelHandle.getDefaultModelData('stt');
    const transcriptionsResult = await aiTranscriptions({
      model,
      fileStream: result.getReadStream(),
      filename: result.fileMetadata.originalname
    });

    await pushSTTUsage({
      teamId,
      tmbId,
      model,
      usage: getSTTBillableUsage({ pricing: model.pricing, usage: transcriptionsResult.usage }),
      source: UsageSourceEnum.fastgpt
    });

    jsonRes(res, {
      data: transcriptionsResult.text
    });
  } catch (err) {
    if (err instanceof ApiRequestInputParseError || err === ERROR_ENUM.tooManyRequest) {
      throw err;
    }
    jsonRes(res, {
      code: 500,
      error: err
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
