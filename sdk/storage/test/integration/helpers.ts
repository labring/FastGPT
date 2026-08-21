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
 * 清空已存在的集成测试 bucket，但保留 bucket 本身。
 *
 * 云厂商的 bucket 名称通常是全局命名空间，删除后重新创建可能经历较长的最终一致性窗口；
 * 真实 provider 测试应复用专用空 bucket，避免测试结果受 bucket 回收延迟影响。
 */
export const clearIntegrationBucketObjects = async ({
  storage,
  bucketExists
}: {
  storage: IStorage;
  bucketExists: () => Promise<boolean>;
}): Promise<boolean> => {
  if (!(await bucketExists())) return false;

  const { keys } = await storage.listObjects({});
  if (keys.length > 0) {
    const { keys: failedKeys } = await storage.deleteObjectsByMultiKeys({ keys });
    if (failedKeys.length > 0) {
      throw new Error(`Failed to clean integration test bucket: ${failedKeys.join(', ')}`);
    }
  }

  return true;
};

/** 清空并删除已存在的集成测试 bucket；MinIO 专项测试用此验证自动建桶。 */
export const removeIntegrationBucketIfExists = async ({
  storage,
  bucketExists,
  deleteBucket
}: {
  storage: IStorage;
  bucketExists: () => Promise<boolean>;
  deleteBucket: () => Promise<void>;
}): Promise<void> => {
  if (!(await clearIntegrationBucketObjects({ storage, bucketExists }))) return;
  await deleteBucket();
};
