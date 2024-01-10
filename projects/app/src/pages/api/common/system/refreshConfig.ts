import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { initSystemConfig } from './getInitData';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });
    await initSystemConfig();

    console.log(`refresh config`);
    console.log({
      chatModels: global.chatModels,
      qaModels: global.qaModels,
      cqModels: global.cqModels,
      extractModels: global.extractModels,
      qgModels: global.qgModels,
      vectorModels: global.vectorModels,
      reRankModels: global.reRankModels,
      audioSpeechModels: global.audioSpeechModels,
      whisperModel: global.whisperModel,
      feConfigs: global.feConfigs,
      systemEnv: global.systemEnv
    });
  } catch (error) {
    console.log(error);
  }
  jsonRes(res);
}
