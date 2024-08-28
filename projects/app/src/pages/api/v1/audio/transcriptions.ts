import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import fs from 'fs';
import { pushWhisperUsage } from '@/service/support/wallet/usage/push';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { NextAPI } from '@/service/middleware/entry';
import { aiTranscriptions } from '@fastgpt/service/core/ai/audio/transcriptions';

const upload = getUploadModel({
  maxSize: 20
});

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  let filePaths: string[] = [];

  try {
    const {
      file,
      data: { appId, duration, shareId, outLinkUid, teamId: spaceTeamId, teamToken }
    } = await upload.doUpload<
      OutLinkChatAuthProps & {
        appId: string;
        duration: number;
      }
    >(req, res);

    req.body.shareId = shareId;
    req.body.outLinkUid = outLinkUid;
    req.body.teamId = spaceTeamId;
    req.body.teamToken = teamToken;

    filePaths = [file.path];

    if (!global.whisperModel) {
      throw new Error('whisper model not found');
    }

    if (!file) {
      throw new Error('file not found');
    }

    // auth role
    const { teamId, tmbId } = await authChatCert({ req, authToken: true });

    // auth app
    // const app = await MongoApp.findById(appId, 'modules').lean();
    // if (!app) {
    //   throw new Error('app not found');
    // }
    // if (!whisperConfig?.open) {
    //   throw new Error('Whisper is not open in the app');
    // }

    const result = await aiTranscriptions({
      model: global.whisperModel.model,
      fileStream: fs.createReadStream(file.path)
    });

    pushWhisperUsage({
      teamId,
      tmbId,
      duration
    });

    jsonRes(res, {
      data: result.text
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }

  removeFilesByPaths(filePaths);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
