import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { handleSkillEditChat } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/handler';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleSkillEditChat(req, res);
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
