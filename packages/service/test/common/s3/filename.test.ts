import { describe, expect, it } from 'vitest';
import {
  decodeMultipartFilename,
  decodeS3Filename,
  encodeS3Filename,
  getS3UploadContentDisposition
} from '@fastgpt/service/common/s3/filename';

describe('S3 filename metadata codec', () => {
  it('round-trips Unicode filenames through ASCII metadata', () => {
    const filename = '中文 文件😀.pdf';

    expect(decodeS3Filename(encodeS3Filename(filename))).toBe(filename);
  });

  it('bounds very long encoded metadata while keeping it decodable', () => {
    const encodedFilename = encodeS3Filename('😀'.repeat(1000) + '.pdf');

    expect(encodedFilename.length).toBeLessThanOrEqual(512);
    expect(decodeS3Filename(encodedFilename)).toMatch(/^😀+/);
    expect(decodeS3Filename(encodedFilename).endsWith('.pdf')).toBe(true);
  });

  it('bounds upload Content-Disposition while preserving the extension', () => {
    const contentDisposition = getS3UploadContentDisposition({
      filename: '😀'.repeat(1000) + '.pdf'
    });

    expect(contentDisposition.length).toBeLessThan(1200);
    expect(contentDisposition).toContain('.pdf');
  });

  it('bounds an oversized extension and replaces lone UTF-16 surrogates', () => {
    const filename = `bad\ud800.${'x'.repeat(2000)}`;
    const contentDisposition = getS3UploadContentDisposition({ filename });

    expect(contentDisposition.length).toBeLessThan(1200);
    expect(decodeS3Filename(encodeS3Filename('bad\ud800.pdf'))).toBe('bad�.pdf');
  });

  it('preserves raw Unicode filenames that contain percent literals', () => {
    const filename = '中文%20文件.pdf';

    expect(decodeS3Filename(filename)).toBe(filename);
  });

  it('keeps raw ASCII percent literals that are not valid URI escapes', () => {
    expect(decodeS3Filename('100%.txt')).toBe('100%.txt');
  });

  it('returns raw input when a historical value has an invalid escape', () => {
    expect(decodeS3Filename('%E4%B8%AD%ZZ.txt')).toBe('%E4%B8%AD%ZZ.txt');
  });

  it('returns an empty string for missing metadata', () => {
    expect(decodeS3Filename()).toBe('');
    expect(decodeS3Filename('')).toBe('');
  });

  it('decodes historical Unicode multipart filenames but preserves ASCII literals', () => {
    expect(decodeMultipartFilename(encodeURIComponent('中文文件.pdf'))).toBe('中文文件.pdf');
    expect(decodeMultipartFilename('file%20name.pdf')).toBe('file%20name.pdf');
    expect(decodeMultipartFilename('中文%20文件.pdf')).toBe('中文%20文件.pdf');
  });

  it('preserves literal ASCII percent escapes in upload policy filenames', () => {
    expect(decodeMultipartFilename('report%20final.pdf')).toBe('report%20final.pdf');
    expect(decodeMultipartFilename('report%25final.pdf')).toBe('report%25final.pdf');
  });
});
