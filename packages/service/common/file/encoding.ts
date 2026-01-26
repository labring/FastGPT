import * as iconv from 'iconv-lite';
import { addLog } from '../system/log';

/**
 * GBK编码检测阈值
 * 当采样数据中符合GBK编码规则的字节比例超过此阈值时，判定为GBK编码
 */
const GBK_DETECTION_THRESHOLD = 0.9;

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

    // 先检测GBK特征（中文编码）
    // GBK的第一个字节范围: 0x81-0xFE，第二个字节范围: 0x40-0xFE
    let gbkLikeBytes = 0;
    for (let i = 0; i < sample.length - 1; i++) {
      if (
        sample[i] >= 0x81 &&
        sample[i] <= 0xfe &&
        sample[i + 1] >= 0x40 &&
        sample[i + 1] <= 0xfe
      ) {
        gbkLikeBytes += 2;
        i++; // 跳过第二个字节
      }
    }

    // 如果GBK特征明显（超过设定阈值的字节符合GBK编码规则），优先使用GBK
    const gbkRatio = sample.length > 0 ? gbkLikeBytes / sample.length : 0;
    if (gbkRatio > GBK_DETECTION_THRESHOLD) {
      encoding = 'gbk';
      addLog.debug(
        `[detectAndDecodeBuffer] GBK detection: gbkLikeBytes=${gbkLikeBytes}, sample.length=${sample.length}, ratio=${gbkRatio.toFixed(3)}, threshold=${GBK_DETECTION_THRESHOLD}`
      );
    } else {
      // 验证UTF-8有效性：检查字节序列是否符合UTF-8编码规则
      let isValidUtf8 = true;
      for (let i = 0; i < sample.length; i++) {
        const byte = sample[i];
        // ASCII字符 (0x00-0x7F)
        if (byte <= 0x7f) {
          continue;
        }
        // 2字节UTF-8 (110xxxxx 10xxxxxx)
        else if (byte >= 0xc2 && byte <= 0xdf) {
          if (i + 1 >= sample.length || (sample[i + 1] & 0xc0) !== 0x80) {
            isValidUtf8 = false;
            break;
          }
          i += 1;
        }
        // 3字节UTF-8 (1110xxxx 10xxxxxx 10xxxxxx)
        else if (byte >= 0xe0 && byte <= 0xef) {
          if (
            i + 2 >= sample.length ||
            (sample[i + 1] & 0xc0) !== 0x80 ||
            (sample[i + 2] & 0xc0) !== 0x80
          ) {
            isValidUtf8 = false;
            break;
          }
          i += 2;
        }
        // 4字节UTF-8 (11110xxx 10xxxxxx 10xxxxxx 10xxxxxx)
        else if (byte >= 0xf0 && byte <= 0xf4) {
          if (
            i + 3 >= sample.length ||
            (sample[i + 1] & 0xc0) !== 0x80 ||
            (sample[i + 2] & 0xc0) !== 0x80 ||
            (sample[i + 3] & 0xc0) !== 0x80
          ) {
            isValidUtf8 = false;
            break;
          }
          i += 3;
        }
        // 无效的UTF-8字节
        else {
          isValidUtf8 = false;
          break;
        }
      }

      encoding = isValidUtf8 ? 'utf-8' : 'gbk';
      addLog.debug(`[detectAndDecodeBuffer] UTF-8 validation: isValidUtf8=${isValidUtf8}`);
    }
  }

  // 3. 跳过BOM并解码
  const contentBuffer = offset > 0 ? buffer.slice(offset) : buffer;

  // Debug: 打印检测到的编码
  addLog.debug(
    `[detectAndDecodeBuffer] Detected encoding: ${encoding}, Buffer size: ${buffer.length}, BOM offset: ${offset}`
  );

  return {
    content: iconv.decode(contentBuffer, encoding),
    encoding
  };
}
