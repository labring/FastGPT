import { describe, it, expect, vi } from 'vitest';
import { parseS3UploadError } from '@fastgpt/global/common/error/s3';

const createTranslator = () =>
  vi.fn((key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  );

describe('parseS3UploadError', () => {
  it('should handle raw string EntityTooLarge error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: 'EntityTooLarge: size exceeds limit',
      maxSize: 10 * 1024 * 1024
    });

    expect(result).toBe('common:error:s3_upload_file_too_large:{"max":"10 MB"}');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_file_too_large', { max: '10 MB' });
  });

  it('should handle axios response EntityTooLarge error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        response: {
          data: '<Error><Code>EntityTooLarge</Code></Error>'
        }
      },
      maxSize: 1024
    });

    expect(result).toBe('common:error:s3_upload_file_too_large:{"max":"1 KB"}');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_file_too_large', { max: '1 KB' });
  });

  it('should handle AccessDenied error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        response: {
          data: 'AccessDenied'
        }
      }
    });

    expect(result).toBe('common:error:s3_upload_auth_failed');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_auth_failed');
  });

  it('should handle invalid access key or signature errors', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        response: {
          data: 'InvalidAccessKeyId'
        }
      }
    });

    expect(result).toBe('common:error:s3_upload_auth_failed');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_auth_failed');
  });

  it('should handle NoSuchBucket error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        response: {
          data: 'NoSuchBucket'
        }
      }
    });

    expect(result).toBe('common:error:s3_upload_bucket_not_found');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_bucket_not_found');
  });

  it('should handle RequestTimeout error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        response: {
          data: 'RequestTimeout'
        }
      }
    });

    expect(result).toBe('common:error:s3_upload_timeout');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_timeout');
  });

  it('should handle network errors', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        code: 'ECONNREFUSED'
      }
    });

    expect(result).toBe('common:error:s3_upload_network_error');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_network_error');
  });

  it('should handle axios timeout errors', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        code: 'ECONNABORTED'
      }
    });

    expect(result).toBe('common:error:s3_upload_timeout');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_timeout');
  });

  it('should handle timeout message errors', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        message: 'timeout of 3000ms exceeded'
      }
    });

    expect(result).toBe('common:error:s3_upload_timeout');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_timeout');
  });

  it('should handle client side file size validation errors', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        message: 'file size is too large'
      }
    });

    expect(result).toBe('common:error:s3_upload_file_too_large:{"max":"-"}');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_file_too_large', { max: '-' });
  });

  it('should return default network error for unknown error', () => {
    const t = createTranslator();
    const result = parseS3UploadError({
      t,
      error: {
        message: 'unknown error'
      }
    });

    expect(result).toBe('common:error:s3_upload_network_error');
    expect(t).toHaveBeenCalledWith('common:error:s3_upload_network_error');
  });
});
