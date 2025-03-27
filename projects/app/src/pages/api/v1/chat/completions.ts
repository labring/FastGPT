import { NextAPI } from '@/service/middleware/entry';
import { createCompletionsHandler } from '@/service/core/chat/completions';

const handler = createCompletionsHandler({ version: 'v1' });

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
