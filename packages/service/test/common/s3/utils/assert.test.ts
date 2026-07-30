import { describe, expect, it } from 'vitest';
import { InvalidObjectNameError, InvalidXMLError, S3Error } from 'minio';
import { isFileNotFoundError } from '@fastgpt/service/common/s3/utils/assert';

describe('isFileNotFoundError', () => {
  it('recognizes provider-neutral 404 response shapes', () => {
    const errors = [
      { statusCode: 404 },
      { status: 404 },
      { $metadata: { httpStatusCode: 404 } },
      { code: 'NotFound' },
      { name: 'NoSuchKey' },
      { name: 'NoSuchObject' }
    ];

    errors.forEach((error) => {
      expect(isFileNotFoundError(error)).toBe(true);
    });
  });

  it('recognizes MinIO not-found errors', () => {
    const s3Error = new S3Error('Not Found');
    s3Error.code = 'NoSuchKey';

    expect(isFileNotFoundError(s3Error)).toBe(true);
    expect(isFileNotFoundError(new InvalidObjectNameError())).toBe(true);
    expect(isFileNotFoundError(new InvalidXMLError())).toBe(true);
  });

  it('does not classify unrelated errors as missing objects', () => {
    expect(isFileNotFoundError(undefined)).toBe(false);
    expect(isFileNotFoundError('Not Found')).toBe(false);
    expect(isFileNotFoundError(new Error('Not Found'))).toBe(false);
    expect(isFileNotFoundError({ statusCode: 500 })).toBe(false);
    expect(isFileNotFoundError({ code: 'AccessDenied' })).toBe(false);
  });
});
