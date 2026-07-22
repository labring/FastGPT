import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { pushWhisperUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { getDefaultSTTModel } from '@fastgpt/service/core/ai/model';
import { multer } from '@fastgpt/service/common/file/multer';
import { AudioTranscriptionsDataSchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
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

    if (!getDefaultSTTModel()) {
      throw new Error('whisper model not found');
    }

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

    const transcriptionsResult = await aiTranscriptions({
      model: getDefaultSTTModel(),
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
    jsonRes(res, {
      code: 500,
      error: err
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'transcriptions', seconds: 1, limit: 1 }),
  handler
);

export const config = {
  api: {
    bodyParser: false
  }
};
