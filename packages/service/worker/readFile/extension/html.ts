import { ReadRawTextByBuffer, ReadFileResponse } from '../type';
import { readFileRawText } from './rawText';
import { html2md } from '../../htmlStr2Md/utils';

export const readHtmlRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText: html } = readFileRawText(params);

  const { rawText, imageList } = html2md(html);

  return {
    rawText,
    imageList
  };
};
