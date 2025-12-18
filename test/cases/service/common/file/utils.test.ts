import { describe, it, expect } from 'vitest';
import { getContentTypeFromHeader } from '@fastgpt/service/common/file/utils';

describe('getContentTypeFromHeader', () => {
  it('should extract and normalize content type from header', () => {
    expect(getContentTypeFromHeader('image/jpeg')).toBe('image/jpeg');
    expect(getContentTypeFromHeader('image/png; charset=utf-8')).toBe('image/png');
    expect(getContentTypeFromHeader('text/html; charset=UTF-8')).toBe('text/html');
    expect(getContentTypeFromHeader('application/json;charset=utf-8')).toBe('application/json');
  });

  it('should handle uppercase content types and convert to lowercase', () => {
    expect(getContentTypeFromHeader('Image/JPEG')).toBe('image/jpeg');
    expect(getContentTypeFromHeader('IMAGE/PNG')).toBe('image/png');
    expect(getContentTypeFromHeader('Application/JSON')).toBe('application/json');
    expect(getContentTypeFromHeader('TEXT/HTML')).toBe('text/html');
  });

  it('should handle mixed case content types', () => {
    expect(getContentTypeFromHeader('Image/Jpeg')).toBe('image/jpeg');
    expect(getContentTypeFromHeader('IMAGE/png; charset=UTF-8')).toBe('image/png');
    expect(getContentTypeFromHeader('Application/Json')).toBe('application/json');
  });

  it('should trim whitespace', () => {
    expect(getContentTypeFromHeader('  image/jpeg  ')).toBe('image/jpeg');
    expect(getContentTypeFromHeader(' image/png ; charset=utf-8 ')).toBe('image/png');
    expect(getContentTypeFromHeader('text/html ;charset=UTF-8')).toBe('text/html');
  });

  it('should handle empty or undefined input', () => {
    // Empty string after processing results in empty string, not undefined
    expect(getContentTypeFromHeader('')).toBe('');
    expect(getContentTypeFromHeader(undefined as any)).toBe(undefined);
  });

  it('should handle content types with multiple parameters', () => {
    expect(getContentTypeFromHeader('image/jpeg; charset=utf-8; boundary=something')).toBe(
      'image/jpeg'
    );
    expect(getContentTypeFromHeader('multipart/form-data; boundary=----WebKit')).toBe(
      'multipart/form-data'
    );
  });

  it('should handle content types without parameters', () => {
    expect(getContentTypeFromHeader('image/webp')).toBe('image/webp');
    expect(getContentTypeFromHeader('image/gif')).toBe('image/gif');
    expect(getContentTypeFromHeader('image/svg+xml')).toBe('image/svg+xml');
  });

  it('should handle special image formats', () => {
    expect(getContentTypeFromHeader('image/x-icon')).toBe('image/x-icon');
    expect(getContentTypeFromHeader('image/vnd.microsoft.icon')).toBe('image/vnd.microsoft.icon');
    expect(getContentTypeFromHeader('image/heic')).toBe('image/heic');
    expect(getContentTypeFromHeader('image/avif')).toBe('image/avif');
  });

  it('should handle edge cases with semicolons', () => {
    expect(getContentTypeFromHeader('image/jpeg;')).toBe('image/jpeg');
    expect(getContentTypeFromHeader('image/png;;')).toBe('image/png');
  });
});
