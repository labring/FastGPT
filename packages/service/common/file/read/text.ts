/**
 * 粗略判断 buffer 是否像文本。文本类没有稳定 magic bytes，因此只能作为弱证据：
 * 可以用于无后缀外部 URL 的 txt fallback，不能用来证明任意二进制格式。
 */
export const isLikelyTextBuffer = (buffer: Buffer) => {
  if (buffer.length === 0) return true;

  let suspiciousBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) return false;

    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / buffer.length < 0.1;
};
