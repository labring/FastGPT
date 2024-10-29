import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { WorkerNameEnum, runWorker } from '../../worker/utils';
import { ImageType } from '../../worker/readFile/type';

export const htmlToMarkdown = async (html?: string | null) => {
  const md = await runWorker<{
    rawText: string;
    imageList: ImageType[];
  }>(WorkerNameEnum.htmlStr2Md, { html: html || '' });

  return simpleMarkdownText(md.rawText);
};
