import { describe, it, expect } from 'vitest';
import { sanitizeS3ObjectKey } from '@fastgpt/service/common/s3/utils';

describe('sanitizeS3ObjectKey', () => {
  it('should replace parentheses with square brackets', () => {
    expect(sanitizeS3ObjectKey('file(1).txt')).toBe('file[1].txt');
    expect(sanitizeS3ObjectKey('photo (copy).jpg')).toBe('photo [copy].jpg');
    expect(sanitizeS3ObjectKey('document(v2)(final).pdf')).toBe('document[v2][final].pdf');
  });

  it('should replace opening parenthesis with opening bracket', () => {
    expect(sanitizeS3ObjectKey('test(')).toBe('test[');
    expect(sanitizeS3ObjectKey('((test')).toBe('[[test');
  });

  it('should replace closing parenthesis with closing bracket', () => {
    expect(sanitizeS3ObjectKey('test)')).toBe('test]');
    expect(sanitizeS3ObjectKey('test))')).toBe('test]]');
  });

  it('should handle multiple parentheses', () => {
    expect(sanitizeS3ObjectKey('a(b)c(d)e')).toBe('a[b]c[d]e');
    expect(sanitizeS3ObjectKey('((()))')).toBe('[[[]]]');
  });

  it('should return unchanged string when no parentheses present', () => {
    expect(sanitizeS3ObjectKey('normal-file.txt')).toBe('normal-file.txt');
    expect(sanitizeS3ObjectKey('path/to/file.jpg')).toBe('path/to/file.jpg');
    expect(sanitizeS3ObjectKey('file_name_123.pdf')).toBe('file_name_123.pdf');
  });

  it('should handle empty string', () => {
    expect(sanitizeS3ObjectKey('')).toBe('');
  });

  it('should preserve existing square brackets', () => {
    expect(sanitizeS3ObjectKey('file[1].txt')).toBe('file[1].txt');
    expect(sanitizeS3ObjectKey('file[1](2).txt')).toBe('file[1][2].txt');
  });

  it('should handle S3 key paths with parentheses', () => {
    expect(sanitizeS3ObjectKey('dataset/uploads/file (1).pdf')).toBe(
      'dataset/uploads/file [1].pdf'
    );
    expect(sanitizeS3ObjectKey('chat/images/photo(copy).jpg')).toBe('chat/images/photo[copy].jpg');
  });
});
