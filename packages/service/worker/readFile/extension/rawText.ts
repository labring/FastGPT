import iconv from 'iconv-lite';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';

const rawEncodingList = [
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'utf-16le',
  'ucs2',
  'ucs-2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex'
];

// 加载源文件内容
export const readFileRawText = async ({
  buffer,
  encoding
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const content = (() => {
    try {
      if (rawEncodingList.includes(encoding)) {
        return buffer.toString(encoding as BufferEncoding);
      }

      if (encoding) {
        return iconv.decode(buffer, encoding);
      }

      return buffer.toString('utf-8');
    } catch (error) {
      return buffer.toString('utf-8');
    }
  })();

  const { text, imageList } = matchMdImg(content);

  return {
    rawText: text,
    imageList
  };
};
