import type { IStorage } from '../../src/interface';

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

/**
 * 删除已存在的固定集成测试桶，供下次运行重新创建干净环境。
 * `DeleteObjectsResult.keys` 是失败项；只要存在失败 key，就保留桶并让测试失败。
 */
export const removeIntegrationBucketIfExists = async ({
  storage,
  bucketExists,
  deleteBucket
}: {
  storage: IStorage;
  bucketExists: () => Promise<boolean>;
  deleteBucket: () => Promise<void>;
}): Promise<void> => {
  if (!(await bucketExists())) return;

  const { keys } = await storage.listObjects({});
  if (keys.length > 0) {
    const { keys: failedKeys } = await storage.deleteObjectsByMultiKeys({ keys });
    if (failedKeys.length > 0) {
      throw new Error(`Failed to clean integration test bucket: ${failedKeys.join(', ')}`);
    }
  }

  await deleteBucket();
};
