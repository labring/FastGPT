import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import multerLibrary from 'multer';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';

import { multer } from '@fastgpt/service/common/file/multer';
import { decodeMultipartFilename } from '@fastgpt/service/common/s3/filename';

describe('_storage filename callback', () => {
  it('should generate a filename with nanoid and original extension', () => {
    const cb = vi.fn();
    const file = { originalname: 'test-document.pdf' } as Express.Multer.File;

    // Access the internal storage's filename function
    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(null, expect.stringMatching(/^.+\.pdf$/));
  });

  it('should handle encoded filenames', () => {
    const cb = vi.fn();
    const file = {
      originalname: encodeURIComponent('中文文件.docx')
    } as Express.Multer.File;

    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(null, expect.stringMatching(/^.+\.docx$/));
  });

  it('should preserve the extension from a raw Unicode filename', () => {
    const cb = vi.fn();
    const file = { originalname: '中文文件.docx' } as Express.Multer.File;

    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(null, expect.stringMatching(/^.+\.docx$/));
  });

  it('should fall back safely when a historical filename contains an invalid URI escape', () => {
    const cb = vi.fn();
    const file = { originalname: '100%.txt' } as Express.Multer.File;

    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(null, expect.stringMatching(/^.+\.txt$/));
  });

  it('should preserve an ASCII filename containing a literal encoded-looking percent value', () => {
    const cb = vi.fn();
    const file = { originalname: 'file%20name.txt' } as Express.Multer.File;

    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(null, expect.stringMatching(/^.+\.txt$/));
  });

  it('should return error when file has no originalname', () => {
    const cb = vi.fn();
    const file = {} as Express.Multer.File;

    (multer._storage as any).getFilename(null, file, cb);

    expect(cb).toHaveBeenCalledWith(expect.any(Error), '');
  });

  it('should return error when file is undefined', () => {
    const cb = vi.fn();

    (multer._storage as any).getFilename(null, undefined, cb);

    expect(cb).toHaveBeenCalledWith(expect.any(Error), '');
  });
});

describe('singleStore', () => {
  it('accepts raw UTF-8 and RFC 5987 multipart filenames', async () => {
    const server = http.createServer(async (request, response) => {
      const result = await multer.resolveFormData({
        request: request as Parameters<typeof multer.resolveFormData>[0]['request'],
        defParamCharset: 'utf8'
      });
      fs.rmSync(result.fileMetadata.path);
      response.end(result.fileMetadata.originalname);
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      for (const filename of ['中文%20.csv', 'café.csv', 'file name.csv', '100%.csv']) {
        const form = new FormData();
        form.append('file', new Blob(['q,a']), filename);
        expect(await (await fetch(url, { method: 'POST', body: form })).text()).toBe(filename);
      }
      const body =
        '--boundary\r\nContent-Disposition: form-data; name="file"; filename*=UTF-8\'\'%C3%83%C2%A9.csv\r\n\r\nq,a\r\n--boundary--\r\n';
      expect(
        await (
          await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
            body
          })
        ).text()
      ).toBe('Ã©.csv');
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('preserves a UTF-8 filename from a real multipart upload', async () => {
    const server = http.createServer(async (request, response) => {
      const result = await multer.resolveFormData({
        request: request as Parameters<typeof multer.resolveFormData>[0]['request']
      });
      fs.rmSync(result.fileMetadata.path);
      response.end(decodeMultipartFilename(result.fileMetadata.originalname));
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      for (const [filename, multipartFilename] of [
        ['中文 文件.csv', '%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.csv'],
        ['café.csv', 'caf%C3%A9.csv'],
        ['file%20name.csv', 'file%20name.csv']
      ]) {
        const form = new FormData();
        form.append('file', new Blob(['q,a']), multipartFilename);
        const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
          method: 'POST',
          body: form
        });
        expect(await response.text()).toBe(filename);
      }
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should return a multer middleware function', () => {
    const middleware = multer.singleStore(100);
    expect(typeof middleware).toBe('function');
  });

  it('should use default max file size of 500MB', () => {
    const middleware = multer.singleStore();
    expect(typeof middleware).toBe('function');
  });
});

describe('multipleStore', () => {
  it('reads the current amount limit for real multipart uploads and removes partial files after rejection', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-multer-amount-'));
    const config = getTestInstanceConfig().resource;
    const originalLimit = config.uploadFileMaxAmount;
    const originalStorage = multer._storage;
    let sequence = 0;
    multer._storage = multerLibrary.diskStorage({
      destination: temporary,
      filename: (_req, _file, done) => done(null, `owned-${sequence++}.txt`)
    });
    const server = http.createServer(async (request, response) => {
      try {
        const result = await multer.resolveMultipleFormData({
          request: request as Parameters<typeof multer.resolveMultipleFormData>[0]['request']
        });
        const count = result.fileMetadata.length;
        result.fileMetadata.forEach((file) => fs.rmSync(file.path));
        response.end(JSON.stringify({ count }));
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({ code: (error as { code?: string }).code }));
      }
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const upload = () => {
        const form = new FormData();
        for (const filename of ['first.txt', 'second.txt'])
          form.append('file', new Blob(['owned text']), filename);
        return fetch(url, { method: 'POST', body: form });
      };
      config.uploadFileMaxAmount = 1;
      const rejected = await upload();
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ code: 'LIMIT_UNEXPECTED_FILE' });
      expect(fs.readdirSync(temporary)).toEqual([]);
      config.uploadFileMaxAmount = 2;
      const accepted = await upload();
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ count: 2 });
      expect(fs.readdirSync(temporary)).toEqual([]);
    } finally {
      config.uploadFileMaxAmount = originalLimit;
      multer._storage = originalStorage;
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('should return a multer middleware function', () => {
    const middleware = multer.multipleStore(100);
    expect(typeof middleware).toBe('function');
  });

  it('should use default max file size of 500MB', () => {
    const middleware = multer.multipleStore();
    expect(typeof middleware).toBe('function');
  });
});

describe('clearDiskTempFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-multer-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should remove specified files', async () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'content-a');
    fs.writeFileSync(file2, 'content-b');

    multer.clearDiskTempFiles([file1, file2]);

    // fs.rm is async, wait a bit
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
  });

  it('should not throw when file does not exist', () => {
    expect(() => multer.clearDiskTempFiles(['/nonexistent/path/file.txt'])).not.toThrow();
  });

  it('should handle empty array', () => {
    expect(() => multer.clearDiskTempFiles([])).not.toThrow();
  });
});
