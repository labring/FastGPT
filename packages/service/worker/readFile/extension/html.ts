import { type ReadRawTextByBuffer, type ReadFileResponse, type UploadFileHandler } from '../type';
import { readFileRawText } from './rawText';
import { html2md } from '../../htmlStr2Md/utils';

export const readHtmlRawText = async (
  params: ReadRawTextByBuffer,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
): Promise<ReadFileResponse> => {
  const { rawText: html } = await readFileRawText(params, {
    uploadFile: options.uploadFile
  });
  const { rawText } = await html2md(html, {
    uploadFile: options.uploadFile
  });

  return {
    rawText
  };
};
