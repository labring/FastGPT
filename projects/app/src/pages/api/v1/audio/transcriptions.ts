import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import fs from 'fs';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { pushWhisperUsage } from '@/service/support/wallet/usage/push';
import { authChatCert } from '@/service/support/permission/auth/chat';

const upload = getUploadModel({
  maxSize: 2
});

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  let filePaths: string[] = [];

  try {
    const {
      file,
      data: { duration, teamId: spaceTeamId, teamToken }
    } = await upload.doUpload<{
      duration: number;
      shareId?: string;
      teamId?: string;
      teamToken?: string;
    }>(req, res);

    req.body.teamId = spaceTeamId;
    req.body.teamToken = teamToken;

    filePaths = [file.path];

    const { teamId, tmbId } = await authChatCert({ req, authToken: true });

    if (!global.whisperModel) {
      throw new Error('whisper model not found');
    }

    if (!file) {
      throw new Error('file not found');
    }

    const ai = getAIApi();

    const result = await ai.audio.transcriptions.create({
      file: fs.createReadStream(file.path),
      model: global.whisperModel.model
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
});

export const config = {
  api: {
    bodyParser: false
  }
};
