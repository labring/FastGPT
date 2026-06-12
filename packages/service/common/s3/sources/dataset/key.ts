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
  datasetId: string;
}) {
  const parsedKey = parseDatasetFileS3Key(key);

  return !!parsedKey && String(parsedKey.datasetId) === String(datasetId);
}
