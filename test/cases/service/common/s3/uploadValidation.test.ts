import { describe, expect, it } from 'vitest';
import {
  getUploadInspectBytes,
  validateUploadFile
} from '@fastgpt/service/common/s3/validation/upload';

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

describe('getUploadInspectBytes', () => {
  it('returns the configured inspection size', () => {
    expect(getUploadInspectBytes()).toBe(8192);
  });
});

describe('validateUploadFile', () => {
  it('accepts matching png content', async () => {
    await expect(
      validateUploadFile({
        buffer: pngBuffer,
        filename: 'demo.png',
        uploadConstraints: {
          defaultContentType: 'image/png'
        }
      })
    ).resolves.toEqual({
      filename: 'demo.png',
      contentType: 'image/png'
    });
  });

  it('rejects mismatched binary content', async () => {
    await expect(
      validateUploadFile({
        buffer: pngBuffer,
        filename: 'demo.jpg',
        uploadConstraints: {
          defaultContentType: 'image/jpeg'
        }
      })
    ).rejects.toThrow('UploadFileTypeMismatch');
  });

  it('accepts text-like files without binary signature', async () => {
    await expect(
      validateUploadFile({
        buffer: Buffer.from('{"ok":true}', 'utf8'),
        filename: 'demo.json',
        uploadConstraints: {
          defaultContentType: 'application/json'
        }
      })
    ).resolves.toEqual({
      filename: 'demo.json',
      contentType: 'application/json'
    });
  });

  it('decodes encoded filenames before MIME resolution', async () => {
    await expect(
      validateUploadFile({
        buffer: Buffer.from('hello world', 'utf8'),
        filename: 'hello%20world.txt',
        uploadConstraints: {
          defaultContentType: 'application/octet-stream'
        }
      })
    ).resolves.toEqual({
      filename: 'hello world.txt',
      contentType: 'text/plain'
    });
  });

  it('falls back to octet-stream for unknown file extensions', async () => {
    await expect(
      validateUploadFile({
        buffer: Buffer.from([0, 1, 2, 3]),
        filename: 'archive.custom',
        uploadConstraints: {
          defaultContentType: 'application/octet-stream'
        }
      })
    ).resolves.toEqual({
      filename: 'archive.custom',
      contentType: 'application/octet-stream'
    });
  });

  it('accepts files without extension when no stronger MIME signal exists', async () => {
    await expect(
      validateUploadFile({
        buffer: Buffer.from('plain text body', 'utf8'),
        filename: 'README',
        uploadConstraints: {
          defaultContentType: 'application/octet-stream'
        }
      })
    ).resolves.toEqual({
      filename: 'README',
      contentType: 'application/octet-stream'
    });
  });

  it('rejects disallowed file extensions before content inspection', async () => {
    await expect(
      validateUploadFile({
        buffer: pngBuffer,
        filename: 'demo.png',
        uploadConstraints: {
          defaultContentType: 'image/png',
          allowedExtensions: ['.jpg', '.jpeg']
        }
      })
    ).rejects.toThrow('InvalidUploadFileType');
  });

  it('rejects fake image files without valid image content', async () => {
    await expect(
      validateUploadFile({
        buffer: Buffer.from('not an image', 'utf8'),
        filename: 'demo.png',
        uploadConstraints: {
          defaultContentType: 'image/png',
          allowedExtensions: ['.png']
        }
      })
    ).rejects.toThrow('InvalidUploadFileType');
  });
});
