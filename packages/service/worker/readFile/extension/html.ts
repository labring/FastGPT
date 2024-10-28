import { ReadRawTextByBuffer, ReadFileResponse, ImageType } from '../type';
import { readFileRawText } from './rawText';
import { html2md } from '../../htmlStr2Md/utils';
import { load } from 'cheerio';
import { stringToBase64 } from '@zilliz/milvus2-sdk-node';

export const readHtmlRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText: html } = readFileRawText(params);
  // we need to extract the image at first.
  const $ = load(html);
  const imageList: ImageType[] = [];
  $('img').each((_, elem) => {
    const $elem = $(elem);
    const src = $elem.attr('src');
    if (src) {
      const uuid = crypto.randomUUID();
      const base64 = stringToBase64(src);
      const mime = src.split(';')[0].split(':')[1];
      imageList.push({
        uuid,
        base64,
        mime
      });
      $elem.attr('src', uuid);
    }
  });

  const rawText = html2md($.html());

  return {
    rawText,
    imageList
  };
};
