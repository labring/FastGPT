/**
 * 文本判定的可疑字符阈值：控制字符（保留 \t \n \v \f \r）占比超过该值就认为更像二进制。
 */
const suspiciousRatioLimit = 0.1;

const isSuspiciousCodePoint = (codePoint: number) =>
  codePoint < 7 || (codePoint > 14 && codePoint < 32);

const isLikelyTextString = (text: string) => {
  if (text.length === 0) return true;

  let suspiciousChars = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint === 0) return false;

    if (isSuspiciousCodePoint(codePoint)) {
      suspiciousChars += 1;
    }
  }

  return suspiciousChars / text.length < suspiciousRatioLimit;
};

/**
 * 识别 UTF-16 文本并返回编码与正文起点。
 *
 * UTF-16 的裸字节里每两个字节就夹一个 0x00，逐字节扫描会直接判成二进制。有 BOM 时以
 * BOM 为准；没有 BOM 时无法确定码元边界，只能看 0x00 的奇偶分布（以 ASCII 为主的
 * UTF-16 高位字节几乎恒为 0x00，低位字节几乎不为 0x00）。纯非 ASCII 的无 BOM UTF-16
 * （如整段中文）没有可用的 NUL 分布特征，这里识别不出来，会退回通用的文本/编码探测。
 * 返回的 offset 指向跳过 BOM 后的正文起点，供文本判定与编码探测共用同一份识别结果。
 */
export const detectUtf16Text = (
  buffer: Buffer
): { encoding: 'utf-16le' | 'utf-16be'; offset: number } | undefined => {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return { encoding: 'utf-16le', offset: 2 };
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return { encoding: 'utf-16be', offset: 2 };
  }
  if (buffer.length < 4) return undefined;

  const pairs = Math.floor(buffer.length / 2);
  let evenNulBytes = 0;
  let oddNulBytes = 0;
  for (let index = 0; index < pairs; index += 1) {
    if (buffer[index * 2] === 0) evenNulBytes += 1;
    if (buffer[index * 2 + 1] === 0) oddNulBytes += 1;
  }

  if (oddNulBytes / pairs > 0.8 && evenNulBytes / pairs < 0.2) {
    return { encoding: 'utf-16le', offset: 0 };
  }
  if (evenNulBytes / pairs > 0.8 && oddNulBytes / pairs < 0.2) {
    return { encoding: 'utf-16be', offset: 0 };
  }

  return undefined;
};

const decodeUtf16 = ({
  buffer,
  encoding,
  offset
}: {
  buffer: Buffer;
  encoding: 'utf-16le' | 'utf-16be';
  offset: number;
}): string => {
  // TextDecoder 会把探测窗口截断留下的半个码元解码成替换字符，不影响文本判定。
  return new TextDecoder(encoding).decode(buffer.subarray(offset));
};

/**
 * 粗略判断 buffer 是否像文本。文本类没有稳定 magic bytes，因此只能作为弱证据：
 * 可以用于无后缀外部 URL 的 txt fallback，不能用来证明任意二进制格式。
 */
export const isLikelyTextBuffer = (buffer: Buffer) => {
  if (buffer.length === 0) return true;

  const utf16 = detectUtf16Text(buffer);
  if (utf16) {
    return isLikelyTextString(decodeUtf16({ buffer, ...utf16 }));
  }

  let suspiciousBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) return false;

    if (isSuspiciousCodePoint(byte)) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / buffer.length < suspiciousRatioLimit;
};
