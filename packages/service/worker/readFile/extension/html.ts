import { type ReadRawTextByBuffer, type ReadFileResponse, type UploadFileHandler } from '../type';
import { readFileRawText } from './rawText';
import { html2md } from '../../htmlStr2Md/utils';
import { replaceHtmlBase64Images } from '../utils/base64ImageUpload';

export const readHtmlRawText = async (
  params: ReadRawTextByBuffer,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
): Promise<ReadFileResponse> => {
  const { rawText: html } = await readFileRawText(params, {
    uploadFile: options.uploadFile
  });
  const htmlWithUploadedImages = await replaceHtmlBase64Images(html, {
    uploadFile: options.uploadFile
  });

  const { rawText } = html2md(htmlWithUploadedImages);

  return {
    rawText,
    imageList: []
  };
};
