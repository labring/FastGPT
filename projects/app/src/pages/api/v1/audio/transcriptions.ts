import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { pushWhisperUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { getDefaultSTTModelData } from '@fastgpt/service/core/ai/model';
import { multer } from '@fastgpt/service/common/file/multer';
import { AudioTranscriptionsDataSchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({ request: req });
    filepaths.push(result.fileMetadata.path);
    const {
      sourceType,
      sourceId,
      chatId,
      duration: rawDuration,
      outLinkAuthData
    } = parseApiInput({
      req: { body: result.data },
      bodySchema: AudioTranscriptionsDataSchema
    }).body;

    if (!result.fileMetadata) {
      throw new Error('file not found');
    }
    if (rawDuration === undefined) {
      throw new Error('duration not found');
    }
    const duration = rawDuration < 1 ? 1 : rawDuration;

    const { teamId, tmbId } = await authChatTargetCrud({
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

    const transcriptionsResult = await aiTranscriptions({
      model: getDefaultSTTModelData(),
      fileStream: result.getReadStream(),
      filename: result.fileMetadata.originalname
    });

    pushWhisperUsage({
      teamId,
      tmbId,
      duration: transcriptionsResult?.usage?.total_tokens || duration,
      source: UsageSourceEnum.fastgpt
    });

    jsonRes(res, {
      data: transcriptionsResult.text
    });
  } catch (err) {
    if (err === ERROR_ENUM.tooManyRequest) {
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
