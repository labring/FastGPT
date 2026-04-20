import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT_TYPE,
  normalizeMimeType,
  resolveMimeExtension,
  resolveMimeType
} from '@fastgpt/service/common/s3/utils/mime';

describe('normalizeMimeType', () => {
  it('strips charset parameters and lowercases the MIME type', () => {
    expect(normalizeMimeType('Application/JSON; Charset=UTF-8')).toBe('application/json');
  });

  it('falls back when MIME type is missing', () => {
    expect(normalizeMimeType(undefined)).toBe(DEFAULT_CONTENT_TYPE);
    expect(normalizeMimeType(false, 'text/plain')).toBe('text/plain');
  });
});

describe('resolveMimeType', () => {
  it('resolves MIME type from filename', () => {
    expect(resolveMimeType(['report.PDF'])).toBe('application/pdf');
  });

  it('uses the first resolvable input', () => {
    expect(resolveMimeType(['unknown.custom', 'avatar.png'])).toBe('image/png');
  });

  it('returns fallback for unknown file types', () => {
    expect(resolveMimeType(['unknown.custom'])).toBe(DEFAULT_CONTENT_TYPE);
    expect(resolveMimeType(['unknown.custom'], 'text/plain')).toBe('text/plain');
  });
});

describe('resolveMimeExtension', () => {
  it('resolves file extension from MIME type', () => {
    expect(resolveMimeExtension('image/png')).toBe('.png');
    expect(resolveMimeExtension('application/pdf')).toBe('.pdf');
  });

  it('returns empty string for unknown MIME types', () => {
    expect(resolveMimeExtension('application/x-custom-type')).toBe('');
  });
});
