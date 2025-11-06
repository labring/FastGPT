/* 
    Get default-prompt from PromptLoader
*/
import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

export type defaultPromptParam = {
  hypeIndexPrompt: string;
  autoIndexesPrompt: string;
  imageIndexPrompt: string;
};

async function handler(req: NextApiRequest): Promise<defaultPromptParam> {
  return {
    hypeIndexPrompt: global.promptLoader.loadTemplate(
      'hypeIndexes',
      getLocale(req),
      'generate_question_from_faq_prompt'
    ),
    autoIndexesPrompt: global.promptLoader.loadTemplate(
      'autoIndexes',
      getLocale(req),
      'auto_training_prompt'
    ),
    imageIndexPrompt: global.promptLoader.loadTemplate(
      'imageIndex',
      getLocale(req),
      'image_index_prompt'
    )
  };
}

export default NextAPI(handler);
