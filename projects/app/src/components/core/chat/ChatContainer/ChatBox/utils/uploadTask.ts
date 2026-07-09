import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { UserInputFileItemType } from '../type';

type UploadFileIdentity = Pick<UserInputFileItemType, 'id' | 'uploadId'>;

type ApplyUploadResultParams<T extends UploadFileIdentity> = {
  files: T[];
  uploadId: string;
  canceled?: boolean;
};

/**
 * 生成一次本地上传任务的稳定 ID。
 *
 * 该 ID 只用于前端取消、进度写回和删除定位，不参与后端 S3 权限或消息协议。
 */
export const createUploadId = () => getNanoid(12);

/**
 * 获取文件在前端上传任务中的有效身份。
 *
 * 历史消息里的文件可能没有 `uploadId`，需要 fallback 到既有 `id`，避免编辑历史消息时
 * 旧数据结构无法删除或定位。
 */
export const getFileUploadId = (file: UploadFileIdentity) => file.uploadId ?? file.id;

/**
 * 按上传任务 ID 从当前文件列表中定位真实 field array index。
 *
 * 不能使用预览列表的 index，因为预览层会对文件做排序。
 */
export const findFileIndexByUploadId = <T extends UploadFileIdentity>(
  files: T[],
  uploadId: string
) => files.findIndex((file) => getFileUploadId(file) === uploadId);

/**
 * 判断异步上传结果是否仍允许写回 UI。
 *
 * 用户删除文件、组件卸载或任务被主动取消后，异步请求可能仍 resolve/reject，此时必须跳过写回。
 */
export const canApplyUploadResult = <T extends UploadFileIdentity>({
  files,
  uploadId,
  canceled = false
}: ApplyUploadResultParams<T>) => {
  if (canceled) return false;

  return findFileIndexByUploadId(files, uploadId) !== -1;
};

/**
 * 识别浏览器 AbortController 和 axios cancellation 产生的取消错误。
 *
 * 取消上传属于用户主动行为，不应该进入普通上传失败 toast。
 */
export const isUploadAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const maybeAbortError = error as {
    name?: string;
    code?: string;
    __CANCEL__?: boolean;
    message?: string;
  };

  return (
    maybeAbortError.name === 'AbortError' ||
    maybeAbortError.name === 'CanceledError' ||
    maybeAbortError.code === 'ERR_CANCELED' ||
    maybeAbortError.__CANCEL__ === true
  );
};
