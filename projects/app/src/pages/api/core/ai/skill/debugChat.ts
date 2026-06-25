import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { handleSkillDebugChat } from '@fastgpt/service/core/ai/skill/debugChat';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleSkillDebugChat(req, res);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
