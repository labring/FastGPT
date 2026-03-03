import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { pushWhisperUsage } from '@/service/support/wallet/usage/push';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { getDefaultSTTModel } from '@fastgpt/service/core/ai/model';
import { multer } from '@fastgpt/service/common/file/multer';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({ request: req });
    filepaths.push(result.fileMetadata.path);
    let { appId, duration, shareId, outLinkUid, teamId: spaceTeamId, teamToken } = result.data;

    req.body.appId = appId;
    req.body.shareId = shareId;
    req.body.outLinkUid = outLinkUid;
    req.body.teamId = spaceTeamId;
    req.body.teamToken = teamToken;

    if (!getDefaultSTTModel()) {
      throw new Error('whisper model not found');
    }

    if (!result.fileMetadata) {
      throw new Error('file not found');
    }
    if (duration === undefined) {
      throw new Error('duration not found');
    }
    duration = duration < 1 ? 1 : duration;

    const { teamId, tmbId } = await authChatCrud({
      req,
      authToken: true,
      ...req.body
    });

    const transcriptionsResult = await aiTranscriptions({
      model: getDefaultSTTModel(),
      fileStream: result.getReadStream()
    });

    pushWhisperUsage({
      teamId,
      tmbId,
      duration: transcriptionsResult?.usage?.total_tokens || duration
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
