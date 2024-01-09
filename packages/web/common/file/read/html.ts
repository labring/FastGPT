import { htmlStr2Md } from '../../string/markdown';
import { readFileRawText } from './rawText';
import { markdownProcess } from '@fastgpt/global/common/string/markdown';

export const readHtmlFile = async ({
  file,
  uploadImgController
}: {
  file: File;
  uploadImgController?: (base64: string) => Promise<string>;
}) => {
  const { rawText } = await readFileRawText(file);
  const md = htmlStr2Md(rawText);

  const simpleMd = await markdownProcess({
    rawText: md,
    uploadImgController
  });

  return { rawText: rawText };
};
