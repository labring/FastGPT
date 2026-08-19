import { formatFileSize } from '../file/tools';
import { S3ErrEnum } from './code/s3';

/**
 * Parse S3 upload errors from direct storage responses and the upload proxy.
 * Known errors are translated through the supplied i18n function; unknown
 * storage errors use the generic upload error instead of being reported as
 * network failures.
 */
export function parseS3UploadError({
  t,
  error,
  maxSize
}: {
  t: any;
  error: any;
  maxSize?: number;
}): string {
  const maxSizeStr = maxSize ? formatFileSize(maxSize) : '-';

  const getResponseErrorText = (data: unknown) => {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return '';

    const response = data as Record<string, unknown>;
    const nestedError =
      response.error && typeof response.error === 'object'
        ? (response.error as Record<string, unknown>)
        : undefined;

    return [
      response.message,
      response.statusText,
      response.msg,
      response.error,
      nestedError?.message,
      nestedError?.statusText
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
  };

  const responseErrorText = getResponseErrorText(error?.response?.data);
  const errorText = [
    typeof error === 'string' ? error : '',
    error?.message,
    responseErrorText
  ].join(' ');

  // S3 may return XML directly, while the proxy returns the same details in JSON fields.
  if (errorText.includes('EntityTooLarge')) {
    return t('common:error.s3_upload_file_too_large', { max: maxSizeStr });
  }
  if (
    errorText.includes(S3ErrEnum.uploadFileTypeMismatch) ||
    errorText.includes(S3ErrEnum.invalidUploadFileType)
  ) {
    return t('common:error.s3_upload_invalid_file_type');
  }
  if (errorText.includes(S3ErrEnum.fileUploadDisabled)) {
    return t('common:error.file_upload_disabled');
  }

  if (
    errorText.includes('unAuthFile') ||
    errorText.includes('unAuthorization') ||
    errorText.includes('AccessDenied') ||
    errorText.includes('InvalidAccessKeyId') ||
    errorText.includes('SignatureDoesNotMatch')
  ) {
    return t('common:error.s3_upload_auth_failed');
  }
  if (errorText.includes('NoSuchBucket')) {
    return t('common:error.s3_upload_bucket_not_found');
  }
  if (errorText.includes('RequestTimeout')) {
    return t('common:error.s3_upload_timeout');
  }

  // Handle network errors
  if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ERR_NETWORK',
      'ERR_CONNECTION_RESET',
      'ERR_CONNECTION_REFUSED',
      'ERR_NAME_NOT_RESOLVED'
    ].includes(error?.code) ||
    error?.message === 'Network Error'
  ) {
    return t('common:error.s3_upload_network_error');
  }

  // Handle axios timeout
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return t('common:error.s3_upload_timeout');
  }

  // Handle file size validation error (client-side)
  if (error?.message?.includes('file size') || error?.message?.includes('too large')) {
    return t('common:error.s3_upload_file_too_large', { max: maxSizeStr });
  }

  // 未识别的后端错误不一定来自网络，避免把存储服务返回的其他错误误报为网络异常。
  return t('common:upload_file_error');
}
