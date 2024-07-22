import iconv from 'iconv-lite';
import { ReadRawTextByBuffer, ReadFileResponse } from '../type';

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
export const readFileRawText = ({ buffer, encoding }: ReadRawTextByBuffer): ReadFileResponse => {
  const content = rawEncodingList.includes(encoding)
    ? buffer.toString(encoding as BufferEncoding)
    : iconv.decode(buffer, 'gbk');

  return {
    rawText: content
  };
};
