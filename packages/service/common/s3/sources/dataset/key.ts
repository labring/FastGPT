import { isS3ObjectKey } from '../../utils';

/**
 * 解析数据集文件的 S3 key。
 *
 * 数据集文件的第二段是 datasetId。调用方应基于解析出的 datasetId 做权限校验，而不是把
 * S3 对象存在性当作访问权限。
 */
export function parseDatasetFileS3Key(key: string): {
  datasetId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'dataset')) return null;

  const [, datasetId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');

  if (!datasetId || !filename) return null;

  return {
    datasetId,
    filename
  };
}

/**
 * 判断数据集文件 key 是否属于指定 dataset。
 */
export function isAuthorizedDatasetFileS3Key({
  key,
  datasetId
}: {
  key: string;
  datasetId: string | string[];
}) {
  const parsedKey = parseDatasetFileS3Key(key);
  if (!parsedKey) return false;

  if (Array.isArray(datasetId)) {
    return datasetId.some((id) => id && parsedKey.datasetId === String(id));
  }

  return !!datasetId && parsedKey.datasetId === String(datasetId);
}

/**
 * 创建用于过滤数据集 S3 键的谓词函数，仅放行属于指定 datasetId 的对象键。
 */
export function createDatasetFileS3KeyFilter(
  datasetId: string | string[]
): (key: string) => boolean {
  return (key: string) => isAuthorizedDatasetFileS3Key({ key, datasetId });
}
