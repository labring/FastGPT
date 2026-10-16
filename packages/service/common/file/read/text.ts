/**
 * 文本判定的可疑字符阈值：低于该比例才认为是文本串。控制字符（保留 \t \n \v \f \r）
 * 一旦过半就说明更像二进制。
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
 * UTF-16 文本的裸字节里每两个字节就夹一个 0x00，逐字节扫描会直接判成二进制。
 * 这里只做编码识别，不做内容断言：有 BOM 时以 BOM 为准，否则看 0x00 的奇偶分布。
 */
const utf16View = (
  buffer: Buffer
): { encoding: 'utf16le' | 'utf16be'; offset: number } | undefined => {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return { encoding: 'utf16le', offset: 2 };
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return { encoding: 'utf16be', offset: 2 };
  }
  if (buffer.length < 4) return undefined;

  // 无 BOM 时无法确定码元边界，只能靠 0x00 的位置分布推断：以 ASCII 为主的 UTF-16
  // 里高位字节几乎恒为 0x00，低位字节几乎不为 0x00。
  const pairs = Math.floor(buffer.length / 2);
  let evenNulBytes = 0;
  let oddNulBytes = 0;
  for (let index = 0; index < pairs; index += 1) {
    if (buffer[index * 2] === 0) evenNulBytes += 1;
    if (buffer[index * 2 + 1] === 0) oddNulBytes += 1;
  }

  if (oddNulBytes / pairs > 0.8 && evenNulBytes / pairs < 0.2) {
    return { encoding: 'utf16le', offset: 0 };
  }
  if (evenNulBytes / pairs > 0.8 && oddNulBytes / pairs < 0.2) {
    return { encoding: 'utf16be', offset: 0 };
  }

  return undefined;
};

const decodeUtf16 = (
  buffer: Buffer,
  encoding: 'utf16le' | 'utf16be',
  offset: number
): string => {
  const body = buffer.subarray(offset);
  // 探测窗口会按固定字节数截断，可能留下半个码元，先丢弃末尾的残字节。
  const evenBody = body.subarray(0, body.length - (body.length % 2));
  if (encoding === 'utf16le') return evenBody.toString('utf16le');

  const swapped = Buffer.from(evenBody);
  swapped.swap16();
  return swapped.toString('utf16le');
};

/**
 * 粗略判断 buffer 是否像文本。文本类没有稳定 magic bytes，因此只能作为弱证据：
 * 可以用于无后缀外部 URL 的 txt fallback，不能用来证明任意二进制格式。
 */
export const isLikelyTextBuffer = (buffer: Buffer) => {
  if (buffer.length === 0) return true;

  const utf16 = utf16View(buffer);
  if (utf16) {
    return isLikelyTextString(decodeUtf16(buffer, utf16.encoding, utf16.offset));
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
