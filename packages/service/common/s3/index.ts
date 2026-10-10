import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';
import { resetS3AvatarSource } from './sources/avatar';
import { getLogger, LogCategories } from '../logger';
import { startS3DelWorker } from './queue/delete';

const logger = getLogger(LogCategories.INFRA.S3);

/**
 * 用当前实例配置重建 S3 bucket 映射。
 * bucket 的 internal / external 客户端都在构造期读取存储运行策略，
 * 因此配置变化时必须整体替换，才能让新的下载模式与公开地址生效。
 * 头像 bucket 是独立的惰性单例，同样冻结了 external endpoint，需一并失效重建。
 */
export function initS3Buckets() {
  const publicBucket = new S3PublicBucket();
  const privateBucket = new S3PrivateBucket();

  global.s3BucketMap = {
    [publicBucket.bucketName]: publicBucket,
    [privateBucket.bucketName]: privateBucket
  };

  // 丢弃旧头像单例，下次 getS3AvatarSource() 会用新的存储配置重新构造
  resetS3AvatarSource();
}

export const initS3MQWorker = async () => {
  logger.info('Starting S3 delete worker');
  await startS3DelWorker();
};
