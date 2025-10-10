import { addMinioTtlFile } from './controller';
import { addLog } from '../../system/log';

/**
 * @param bucketName - S3 bucket 名称
 * @param objectKey - S3 对象 key
 * @param temporay - 是否为临时文件
 * @param ttl - TTL（单位：小时，仅临时文件有效），默认 7 天
 */
export async function afterCreatePresignedUrl({
  bucketName,
  objectKey,
  temporay = false,
  ttl = 7 * 24
}: {
  bucketName: string;
  objectKey: string;
  temporay?: boolean;
  ttl?: number;
}) {
  try {
    const expiredTime = temporay ? new Date(Date.now() + ttl * 3.6e6) : undefined;
    const info = `TTL: Registered ${temporay ? 'temporary' : 'permanent'} file: ${objectKey}${temporay ? `, expires in ${ttl} hours` : ''}`;
    await addMinioTtlFile({ bucketName, expiredTime, minioKey: objectKey });
    addLog.info(info);
  } catch (error) {
    addLog.error('Failed to register minio TTL', error);
  }
}
