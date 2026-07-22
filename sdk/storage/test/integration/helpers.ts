/** 构造指定总字节数的 ASCII key，并限制单个路径段长度以兼容文件系统型对象存储。 */
export const createAsciiKeyAtLength = ({
  prefix,
  byteLength,
  maxSegmentLength = 200
}: {
  prefix: string;
  byteLength: number;
  maxSegmentLength?: number;
}): string => {
  let remainingLength = byteLength - Buffer.byteLength(prefix);
  if (remainingLength <= 0) {
    throw new Error('Target byte length must be longer than the prefix');
  }

  const segments: string[] = [];
  while (remainingLength > 0) {
    const separatorLength = segments.length > 0 ? 1 : 0;
    const segmentLength = Math.min(maxSegmentLength, remainingLength - separatorLength);
    if (segmentLength <= 0) throw new Error('Insufficient space for another path segment');

    segments.push('a'.repeat(segmentLength));
    remainingLength -= segmentLength + separatorLength;
  }

  return `${prefix}${segments.join('/')}`;
};
