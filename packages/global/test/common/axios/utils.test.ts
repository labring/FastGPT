import { describe, expect, it } from 'vitest';
import { getAxiosContentType, getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';

describe('getAxiosHeaderValue', () => {
  it('should normalize axios header values to strings', () => {
    expect(getAxiosHeaderValue('text/plain')).toBe('text/plain');
    expect(getAxiosHeaderValue(['text/plain', 'text/html'])).toBe('text/plain');
    expect(getAxiosHeaderValue(123)).toBe('123');
  });

  it('should ignore unset and boolean header values', () => {
    expect(getAxiosHeaderValue(undefined)).toBe(undefined);
    expect(getAxiosHeaderValue(null)).toBe(undefined);
    expect(getAxiosHeaderValue(true)).toBe(undefined);
    expect(getAxiosHeaderValue(false)).toBe(undefined);
  });
});

describe('getAxiosContentType', () => {
  it('should extract and normalize the content type', () => {
    expect(getAxiosContentType('Image/PNG; charset=utf-8')).toBe('image/png');
    expect(getAxiosContentType(['Text/HTML; charset=UTF-8'])).toBe('text/html');
  });
});
