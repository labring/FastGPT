import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { WorkerNameEnum, runWorker } from '../../worker/utils';

export const htmlToMarkdown = async (html?: string | null) => {
  const md = await runWorker<string>(WorkerNameEnum.htmlStr2Md, { html: html || '' });

  return simpleMarkdownText(md);
};
