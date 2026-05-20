import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT_TYPE,
  ensureTextContentTypeCharset,
  isTextLikeFile,
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

describe('isTextLikeFile', () => {
  it('detects text-like MIME types', () => {
    expect(isTextLikeFile({ contentType: 'text/markdown' })).toBe(true);
    expect(isTextLikeFile({ contentType: 'application/json' })).toBe(true);
    expect(isTextLikeFile({ contentType: 'image/svg+xml' })).toBe(true);
  });

  it('detects text-like extensions when MIME type is generic', () => {
    expect(isTextLikeFile({ contentType: 'application/octet-stream', filename: 'aaa.md' })).toBe(
      true
    );
    expect(isTextLikeFile({ filename: 'page.HTML' })).toBe(true);
  });

  it('does not mark binary files as text-like', () => {
    expect(isTextLikeFile({ contentType: 'application/pdf', filename: 'report.pdf' })).toBe(false);
    expect(isTextLikeFile({ contentType: 'application/pdf', filename: 'a.md' })).toBe(false);
    expect(isTextLikeFile({ contentType: 'image/png', filename: 'image.png' })).toBe(false);
  });
});

describe('ensureTextContentTypeCharset', () => {
  it('adds utf-8 charset for text-like content types', () => {
    expect(ensureTextContentTypeCharset({ contentType: 'text/markdown', filename: 'aaa.md' })).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(ensureTextContentTypeCharset({ contentType: 'text/html', filename: 'page.html' })).toBe(
      'text/html; charset=utf-8'
    );
  });

  it('keeps existing charset untouched', () => {
    expect(
      ensureTextContentTypeCharset({
        contentType: 'text/markdown; charset=gbk',
        filename: 'aaa.md'
      })
    ).toBe('text/markdown; charset=gbk');
  });

  it('resolves a text MIME type from filename when metadata is generic', () => {
    expect(
      ensureTextContentTypeCharset({
        contentType: 'application/octet-stream',
        filename: 'aaa.md'
      })
    ).toBe('text/markdown; charset=utf-8');
  });

  it('does not add charset for binary files', () => {
    expect(
      ensureTextContentTypeCharset({
        contentType: 'application/pdf',
        filename: 'report.pdf'
      })
    ).toBe('application/pdf');
    expect(
      ensureTextContentTypeCharset({
        contentType: 'application/pdf',
        filename: 'a.md'
      })
    ).toBe('application/pdf');
  });
});
