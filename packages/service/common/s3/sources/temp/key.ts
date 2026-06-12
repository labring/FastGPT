import { isS3ObjectKey } from '../../utils';

/**
 * 判断临时文件 key 是否属于指定团队。
 */
export function isAuthorizedTempFileS3Key({ key, teamId }: { key: string; teamId: string }) {
  return isS3ObjectKey(key, 'temp') && key.startsWith(`temp/${teamId}/`);
}
