import { NextAPI } from '@/service/middleware/entry';
import { createCompletionsHandler } from '@/service/core/chat/completions';

const handler = createCompletionsHandler({ isV2: false });

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
