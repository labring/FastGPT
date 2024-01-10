import { markdownProcess } from '@fastgpt/global/common/string/markdown';
import { htmlStr2Md } from '../../string/markdown';
import { loadFile2Buffer } from '../utils';
import mammoth from 'mammoth';

export const readWordFile = async ({
  file,
  uploadImgController
}: {
  file: File;
  uploadImgController?: (base64: string) => Promise<string>;
}) => {
  const buffer = await loadFile2Buffer({ file });

  const { value: html } = await mammoth.convertToHtml({
    arrayBuffer: buffer
  });
  const md = htmlStr2Md(html);

  const rawText = await markdownProcess({
    rawText: md,
    uploadImgController: uploadImgController
  });

  return {
    rawText
  };
};
