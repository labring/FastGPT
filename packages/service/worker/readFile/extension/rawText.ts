import iconv from 'iconv-lite';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';

const hasNonAsciiByte = (buffer: Buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0x7f) return true;
  }
  return false;
};

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
      const normalizedEncoding = encoding?.toLowerCase?.() || '';

      if (rawEncodingList.includes(normalizedEncoding)) {
        // `ascii` 只适用于 0x00~0x7F 字节，若含非 ASCII 字节则优先按 utf-8 解码，避免中文乱码
        if (normalizedEncoding === 'ascii' && hasNonAsciiByte(buffer)) {
          return buffer.toString('utf-8');
        }

        return buffer.toString(normalizedEncoding as BufferEncoding);
      }

      if (normalizedEncoding) {
        return iconv.decode(buffer, normalizedEncoding);
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
