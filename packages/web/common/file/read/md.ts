import { markdownProcess } from '@fastgpt/global/common/string/markdown';
import { readFileRawText } from './rawText';

export const readMdFile = async ({
  file,
  uploadImgController
}: {
  file: File;
  uploadImgController?: (base64: string) => Promise<string>;
}) => {
  const { rawText: md } = await readFileRawText(file);
  const simpleMd = await markdownProcess({
    rawText: md,
    uploadImgController
  });
  return { rawText: simpleMd };
};
