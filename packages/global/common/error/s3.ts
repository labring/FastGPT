import { formatFileSize } from '../file/tools';

/**
 * Parse S3 upload error and return user-friendly error message key
 * @param error - The error from S3 upload
 * @param maxFileSize - Maximum allowed file size in bytes
 * @returns i18n error message key and parameters
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
  // Handle S3 XML error response
  if (typeof error === 'string' && error.includes('EntityTooLarge')) {
    return t('common:error:s3_upload_file_too_large', { max: maxSizeStr });
  }

  // Handle axios error response
  if (error?.response?.data) {
    const data = error.response.data;

    // Try to parse XML error response
    if (typeof data === 'string') {
      if (data.includes('EntityTooLarge')) {
        return t('common:error:s3_upload_file_too_large', { max: maxSizeStr });
      }
      if (data.includes('AccessDenied')) {
        return t('common:error:s3_upload_auth_failed');
      }
      if (data.includes('InvalidAccessKeyId') || data.includes('SignatureDoesNotMatch')) {
        return t('common:error:s3_upload_auth_failed');
      }
      if (data.includes('NoSuchBucket')) {
        return t('common:error:s3_upload_bucket_not_found');
      }
      if (data.includes('RequestTimeout')) {
        return t('common:error:s3_upload_timeout');
      }
    }
  }

  // Handle network errors
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
    return t('common:error:s3_upload_network_error');
  }

  // Handle axios timeout
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return t('common:error:s3_upload_timeout');
  }

  // Handle file size validation error (client-side)
  if (error?.message?.includes('file size') || error?.message?.includes('too large')) {
    return t('common:error:s3_upload_file_too_large', { max: maxSizeStr });
  }

  // Default error
  return t('common:error:s3_upload_network_error');
}
