import * as iconv from 'iconv-lite';

/**
 * 检测Buffer的编码并返回解码结果
 * 支持BOM检测和启发式编码检测（UTF-8、GBK等）
 *
 * @param buffer - 文件Buffer
 * @returns 解码后的字符串和检测到的编码
 */
export interface DecodeResult {
  content: string;
  encoding: string;
}

export function detectAndDecodeBuffer(buffer: Buffer): DecodeResult {
  let offset = 0;
  let encoding: string = 'utf-8';

  // 1. 检测BOM (Byte Order Mark)
  // UTF-8 BOM: EF BB BF
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    offset = 3;
    encoding = 'utf-8';
  }
  // UTF-16 LE BOM: FF FE
  else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    offset = 2;
    encoding = 'utf-16le';
  }
  // UTF-16 BE BOM: FE FF
  else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    offset = 2;
    encoding = 'utf-16be';
  }
  // 2. 无BOM，使用启发式方法检测编码
  else {
    const sample = buffer.slice(0, Math.min(buffer.length, 1024));

    // 尝试UTF-8解码，检查是否有效
    const utf8Decoded = iconv.decode(sample, 'utf-8');
    const utf8Valid = !utf8Decoded.includes('�') && !utf8Decoded.includes('\uFFFD');

    if (utf8Valid) {
      encoding = 'utf-8';
    } else {
      // 检测是否为GBK编码（常见中文编码）
      // GBK的第一个字节范围: 0x81-0xFE，第二个字节范围: 0x40-0xFE
      let gbkLikeCount = 0;
      for (let i = 0; i < sample.length - 1; i++) {
        if (
          sample[i] >= 0x81 &&
          sample[i] <= 0xfe &&
          sample[i + 1] >= 0x40 &&
          sample[i + 1] <= 0xfe
        ) {
          gbkLikeCount++;
          i++; // 跳过第二个字节
        }
      }
      // 如果GBK特征明显（超过15%的字节符合GBK编码规则），使用GBK
      if (gbkLikeCount > sample.length * 0.15) {
        encoding = 'gbk';
      }
    }
  }

  // 3. 跳过BOM并解码
  const contentBuffer = offset > 0 ? buffer.slice(offset) : buffer;
  return {
    content: iconv.decode(contentBuffer, encoding),
    encoding
  };
}

/**
 * 仅检测Buffer的编码，不进行解码
 *
 * @param buffer - 文件Buffer
 * @returns 检测到的编码名称
 */
export function detectBufferEncoding(buffer: Buffer): string {
  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }
  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le';
  }
  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf-16be';
  }

  // 启发式检测
  const sample = buffer.slice(0, Math.min(buffer.length, 1024));
  const utf8Decoded = iconv.decode(sample, 'utf-8');
  const utf8Valid = !utf8Decoded.includes('�') && !utf8Decoded.includes('\uFFFD');

  if (utf8Valid) {
    return 'utf-8';
  }

  // GBK检测
  let gbkLikeCount = 0;
  for (let i = 0; i < sample.length - 1; i++) {
    if (sample[i] >= 0x81 && sample[i] <= 0xfe && sample[i + 1] >= 0x40 && sample[i + 1] <= 0xfe) {
      gbkLikeCount++;
      i++;
    }
  }
  if (gbkLikeCount > sample.length * 0.15) {
    return 'gbk';
  }

  return 'utf-8'; // 默认返回UTF-8
}

/**
 * 使用指定编码解码Buffer
 *
 * @param buffer - 文件Buffer
 * @param encoding - 编码名称
 * @returns 解码后的字符串
 */
export function decodeBuffer(buffer: Buffer, encoding: string): string {
  return iconv.decode(buffer, encoding);
}
