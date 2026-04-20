import { describe, expect, it } from 'vitest';
import {
  getUploadInspectBytes,
  validateUploadFile
} from '@fastgpt/service/common/s3/validation/upload';

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const docxBuffer = Buffer.from(
  'UEsDBBQAAAAAANeFbFw1gCIhvQAAAL0AAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04Ij8+PFR5cGVzPjxPdmVycmlkZSBQYXJ0TmFtZT0iL3dvcmQvZG9jdW1lbnQueG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQubWFpbit4bWwiLz48L1R5cGVzPlBLAwQUAAAAAADXhWxcjsvbLBkAAAAZAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPHc6ZG9jdW1lbnQ+PC93OmRvY3VtZW50PlBLAQIUAxQAAAAAANeFbFw1gCIhvQAAAL0AAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAAA14VsXI7L2ywZAAAAGQAAABEAAAAAAAAAAAAAAIAB7gAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAgAAAADYBAAAAAA==',
  'base64'
);
const paddedDocxBuffer = Buffer.from(
  'UEsDBBQAAAAAANeFbFw/BDvA4C4AAOAuAAALAAAAcGFkZGluZy5iaW5BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFQSwMEFAAAAAAA14VsXDWAIiG9AAAAvQAAABMAAABbQ29udGVudF9UeXBlc10ueG1sPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48VHlwZXM+PE92ZXJyaWRlIFBhcnROYW1lPSIvd29yZC9kb2N1bWVudC54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudC5tYWluK3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAANeFbFyOy9ssGQAAABkAAAARAAAAd29yZC9kb2N1bWVudC54bWw8dzpkb2N1bWVudD48L3c6ZG9jdW1lbnQ+UEsBAhQDFAAAAAAA14VsXD8EO8DgLgAA4C4AAAsAAAAAAAAAAAAAAIABAAAAAHBhZGRpbmcuYmluUEsBAhQDFAAAAAAA14VsXDWAIiG9AAAAvQAAABMAAAAAAAAAAAAAAIABCS8AAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAAAADXhWxcjsvbLBkAAAAZAAAAEQAAAAAAAAAAAAAAgAH3LwAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAPzAAAAAA',
  'base64'
);
const genericZipBuffer = Buffer.from(
  'UEsDBBQAAAAAANeFbFyFEUoNCwAAAAsAAAAJAAAAaGVsbG8udHh0aGVsbG8gd29ybGRQSwECFAMUAAAAAADXhWxchRFKDQsAAAALAAAACQAAAAAAAAAAAAAAgAEAAAAAaGVsbG8udHh0UEsFBgAAAAABAAEANwAAADIAAAAAAA==',
  'base64'
);

describe('getUploadInspectBytes', () => {
  it('returns the configured inspection size', () => {
    expect(getUploadInspectBytes()).toBe(8192);
  });

  it('uses a larger inspection window for OOXML uploads', () => {
    expect(getUploadInspectBytes('demo.docx')).toBe(64 * 1024);
    expect(getUploadInspectBytes('demo.xlsx')).toBe(64 * 1024);
    expect(getUploadInspectBytes('demo.pptx')).toBe(64 * 1024);
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

  it('accepts mismatched binary content when detected type is also allowed', async () => {
    await expect(
      validateUploadFile({
        buffer: pngBuffer,
        filename: 'demo.jpeg',
        uploadConstraints: {
          defaultContentType: 'image/jpeg',
          allowedExtensions: ['.jpg', '.jpeg', '.png']
        }
      })
    ).resolves.toEqual({
      filename: 'demo.png',
      contentType: 'image/png'
    });
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

  it('accepts OOXML files even when detection falls back to zip container', async () => {
    await expect(
      validateUploadFile({
        buffer: docxBuffer,
        filename: 'demo.docx',
        uploadConstraints: {
          defaultContentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      })
    ).resolves.toEqual({
      filename: 'demo.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  });

  it('accepts padded OOXML files once enough bytes are buffered', async () => {
    expect(getUploadInspectBytes('demo.docx')).toBeGreaterThan(8192);

    await expect(
      validateUploadFile({
        buffer: paddedDocxBuffer,
        filename: 'demo.docx',
        uploadConstraints: {
          defaultContentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      })
    ).resolves.toEqual({
      filename: 'demo.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  });

  it('still rejects generic zip files renamed as docx', async () => {
    await expect(
      validateUploadFile({
        buffer: genericZipBuffer,
        filename: 'demo.docx',
        uploadConstraints: {
          defaultContentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      })
    ).rejects.toThrow('UploadFileTypeMismatch');
  });

  it('accepts AVI when mime-types says video/x-msvideo but file-type says video/vnd.avi', async () => {
    const miniAvi = Buffer.alloc(12);
    miniAvi.write('RIFF', 0, 'ascii');
    miniAvi.writeUInt32LE(256, 4);
    miniAvi.write('AVI ', 8, 'ascii');

    await expect(
      validateUploadFile({
        buffer: miniAvi,
        filename: 'clip.avi',
        uploadConstraints: {
          defaultContentType: 'video/x-msvideo',
          allowedExtensions: ['.avi']
        }
      })
    ).resolves.toMatchObject({
      filename: 'clip.avi',
      contentType: 'video/vnd.avi'
    });
  });

  it('accepts MPEG when mime-types says video/mpeg but file-type says video/MP2P', async () => {
    const miniMpeg = Buffer.from([
      0, 0, 1, 0xba, 0x44, 0x00, 0x04, 0x00, 0x04, 0x01, 0x00, 0x01, 0xe0, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0xe0, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    await expect(
      validateUploadFile({
        buffer: miniMpeg,
        filename: 'clip.mpeg',
        uploadConstraints: {
          defaultContentType: 'video/mpeg',
          allowedExtensions: ['.mpeg']
        }
      })
    ).resolves.toMatchObject({
      filename: 'clip.mpeg',
      contentType: 'video/MP2P'
    });
  });

  it('accepts MPEG-1 PS when mime-types says video/mpeg but file-type says video/MP1S', async () => {
    const mpeg1Ps = Buffer.alloc(32);
    mpeg1Ps[0] = 0;
    mpeg1Ps[1] = 0;
    mpeg1Ps[2] = 1;
    mpeg1Ps[3] = 0xba;
    mpeg1Ps[4] = 0x21;

    await expect(
      validateUploadFile({
        buffer: mpeg1Ps,
        filename: 'clip.mpeg',
        uploadConstraints: {
          defaultContentType: 'video/mpeg',
          allowedExtensions: ['.mpeg']
        }
      })
    ).resolves.toMatchObject({
      filename: 'clip.mpeg',
      contentType: 'video/MP1S'
    });
  });

  it('accepts M4A when mime-types says audio/mp4 but file-type says audio/x-m4a', async () => {
    const miniM4a = Buffer.alloc(32);
    miniM4a.write('ftyp', 4);
    miniM4a.write('M4A ', 8);

    await expect(
      validateUploadFile({
        buffer: miniM4a,
        filename: 'clip.m4a',
        uploadConstraints: {
          defaultContentType: 'audio/mp4',
          allowedExtensions: ['.m4a']
        }
      })
    ).resolves.toMatchObject({
      filename: 'clip.m4a',
      contentType: 'audio/x-m4a'
    });
  });
});
