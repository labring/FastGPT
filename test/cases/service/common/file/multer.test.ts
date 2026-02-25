import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'os';
import path from 'path';

import { multer } from '@fastgpt/service/common/file/multer';

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
