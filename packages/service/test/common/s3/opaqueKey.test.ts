import { describe, expect, it } from 'vitest';
import {
  createOpaqueS3FileKey,
  createS3FileId,
  getS3ParsedPrefix,
  isOpaqueS3FileKey,
  isOpaqueS3ParsedObjectKey
} from '@fastgpt/service/common/s3/opaqueKey';

const fileId = '0123456789abcdef0123456789abcdef';

describe('createS3FileId', () => {
  it('returns a 32-character lowercase hexadecimal id without hyphens', () => {
    const id = createS3FileId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('-');
  });
});

describe('createOpaqueS3FileKey', () => {
  it('does not put a long Unicode filename into the object key', () => {
    const filename = `${'中文文件名😀'.repeat(2000)}.PDF`;
    const result = createOpaqueS3FileKey({
      prefix: ['dataset', 'dataset-1'],
      filename
    });

    expect(result.objectKey).toMatch(/^dataset\/dataset-1\/file\/[0-9a-f]{32}\.pdf$/);
    expect(result.parsedPrefix).toMatch(/^dataset\/dataset-1\/parsed\/[0-9a-f]{32}$/);
    expect(Buffer.byteLength(result.objectKey)).toBeLessThan(800);
    expect(result.objectKey).not.toContain('%');
    expect(result.objectKey).not.toContain('中文');
    expect(result.parsedPrefix).toBe(`dataset/dataset-1/parsed/${result.fileId}`);
  });

  it('generates distinct keys for same-name uploads', () => {
    const first = createOpaqueS3FileKey({ prefix: ['temp', 'team-1'], filename: 'same.txt' });
    const second = createOpaqueS3FileKey({ prefix: ['temp', 'team-1'], filename: 'same.txt' });

    expect(first.objectKey).not.toBe(second.objectKey);
    expect(first.parsedPrefix).not.toBe(second.parsedPrefix);
  });

  it('keeps only a normalized ASCII extension', () => {
    expect(
      createOpaqueS3FileKey({ prefix: ['dataset', 'dataset-1'], filename: 'report.PDF' }).objectKey
    ).toMatch(/\.pdf$/);
    expect(
      createOpaqueS3FileKey({ prefix: ['dataset', 'dataset-1'], filename: 'report.中文' }).objectKey
    ).not.toMatch(/\.[^/]+$/);
    expect(
      createOpaqueS3FileKey({ prefix: ['dataset', 'dataset-1'], filename: 'report' }).objectKey
    ).not.toMatch(/\.[^/]+$/);
  });

  it('drops an unreasonably long extension instead of exceeding the key limit', () => {
    const result = createOpaqueS3FileKey({
      prefix: ['dataset', 'dataset-1'],
      filename: `report.${'x'.repeat(1000)}`
    });

    expect(result.objectKey).toMatch(/^dataset\/dataset-1\/file\/[0-9a-f]{32}$/);
    expect(Buffer.byteLength(result.objectKey)).toBeLessThan(800);
  });

  it('encodes scope segments while keeping the file id opaque', () => {
    const result = createOpaqueS3FileKey({
      prefix: ['temp', 'team one'],
      filename: 'report.txt'
    });

    expect(result.objectKey).toMatch(/^temp\/team%20one\/file\/[0-9a-f]{32}\.txt$/);
    expect(result.parsedPrefix).toMatch(/^temp\/team%20one\/parsed\/[0-9a-f]{32}$/);
  });
});

describe('opaque key recognition and parsed prefix', () => {
  it('recognizes opaque source and parsed object keys', () => {
    const sourceKey = `dataset/dataset-1/file/${fileId}.pdf`;
    const parsedKey = `dataset/dataset-1/parsed/${fileId}/image.png`;

    expect(isOpaqueS3FileKey(sourceKey)).toBe(true);
    expect(isOpaqueS3FileKey('dataset/dataset-1/report.pdf')).toBe(false);
    expect(isOpaqueS3ParsedObjectKey(parsedKey)).toBe(true);
    expect(isOpaqueS3ParsedObjectKey('dataset/dataset-1/folder/parsed/image.png')).toBe(false);
  });

  it('uses the new parsed prefix for opaque keys and legacy derivation otherwise', () => {
    expect(getS3ParsedPrefix(`dataset/dataset-1/file/${fileId}.pdf`)).toBe(
      `dataset/dataset-1/parsed/${fileId}`
    );
    expect(getS3ParsedPrefix('dataset/dataset-1/report.pdf')).toBe(
      'dataset/dataset-1/report-parsed'
    );
    expect(getS3ParsedPrefix('report.pdf')).toBe('report-parsed');
  });

  it('keeps the parsed prefix round-trip for a root-level opaque key', () => {
    const result = createOpaqueS3FileKey({ prefix: [], filename: 'file.pdf' });

    expect(getS3ParsedPrefix(result.objectKey)).toBe(result.parsedPrefix);
  });
});
