import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let mockIsProduction = false;

vi.mock('@fastgpt/global/common/system/constants', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/global/common/system/constants')>();
  return {
    ...mod,
    get isProduction() {
      return mockIsProduction;
    }
  };
});

import {
  getContentTypeFromHeader,
  getFileMaxSize,
  removeFilesByPaths,
  clearDirFiles,
  clearTmpUploadFiles
} from '@fastgpt/service/common/file/utils';

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

describe('getFileMaxSize', () => {
  it('should return default max size (1000MB) when uploadFileMaxSize is not set', () => {
    const original = global.feConfigs?.uploadFileMaxSize;
    global.feConfigs = { ...global.feConfigs } as any;
    delete (global.feConfigs as any).uploadFileMaxSize;
    expect(getFileMaxSize()).toBe(1000 * 1024 * 1024);
    if (original !== undefined) {
      (global.feConfigs as any).uploadFileMaxSize = original;
    }
  });

  it('should return configured max size in bytes', () => {
    const original = global.feConfigs?.uploadFileMaxSize;
    (global.feConfigs as any).uploadFileMaxSize = 500;
    expect(getFileMaxSize()).toBe(500 * 1024 * 1024);
    if (original !== undefined) {
      (global.feConfigs as any).uploadFileMaxSize = original;
    } else {
      delete (global.feConfigs as any).uploadFileMaxSize;
    }
  });

  it('should handle zero value and fall back to default', () => {
    (global.feConfigs as any).uploadFileMaxSize = 0;
    // 0 is falsy, so it falls back to 1000
    expect(getFileMaxSize()).toBe(1000 * 1024 * 1024);
    delete (global.feConfigs as any).uploadFileMaxSize;
  });
});

describe('removeFilesByPaths', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should remove specified files', async () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'a');
    fs.writeFileSync(file2, 'b');

    removeFilesByPaths([file1, file2]);

    // fs.unlink is async, wait a bit
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
  });

  it('should not throw when file does not exist', () => {
    expect(() => removeFilesByPaths(['/nonexistent/path/file.txt'])).not.toThrow();
  });

  it('should handle empty array', () => {
    expect(() => removeFilesByPaths([])).not.toThrow();
  });
});

describe('clearDirFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should remove directory and its contents', () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'file.txt'), 'content');

    clearDirFiles(subDir);
    expect(fs.existsSync(subDir)).toBe(false);
  });

  it('should do nothing when directory does not exist', () => {
    expect(() => clearDirFiles('/nonexistent/dir/path')).not.toThrow();
  });
});

describe('clearTmpUploadFiles', () => {
  afterEach(() => {
    mockIsProduction = false;
    vi.restoreAllMocks();
  });

  it('should return early when not in production', () => {
    mockIsProduction = false;
    const readdirSpy = vi.spyOn(fs, 'readdir');
    clearTmpUploadFiles();
    expect(readdirSpy).not.toHaveBeenCalled();
  });

  it('should read /tmp directory in production', () => {
    mockIsProduction = true;
    const readdirSpy = vi
      .spyOn(fs, 'readdir')
      .mockImplementation((_path: any, cb: any) => cb(null, []));
    clearTmpUploadFiles();
    expect(readdirSpy).toHaveBeenCalledWith('/tmp', expect.any(Function));
  });

  it('should handle readdir error gracefully', () => {
    mockIsProduction = true;
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) =>
      cb(new Error('read error'))
    );
    expect(() => clearTmpUploadFiles()).not.toThrow();
  });

  it('should skip v8-compile-cache-0 file', () => {
    mockIsProduction = true;
    const statSpy = vi.spyOn(fs, 'stat');
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) =>
      cb(null, ['v8-compile-cache-0'])
    );
    clearTmpUploadFiles();
    expect(statSpy).not.toHaveBeenCalled();
  });

  it('should delete files older than 2 hours', () => {
    mockIsProduction = true;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockImplementation((_path: any, cb: any) => cb(null));
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) => cb(null, ['old-file.tmp']));
    vi.spyOn(fs, 'stat').mockImplementation((_path: any, cb: any) =>
      cb(null, { mtime: threeHoursAgo } as fs.Stats)
    );
    clearTmpUploadFiles();
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/old-file.tmp', expect.any(Function));
  });

  it('should not delete files newer than 2 hours', () => {
    mockIsProduction = true;
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const unlinkSpy = vi.spyOn(fs, 'unlink');
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) => cb(null, ['new-file.tmp']));
    vi.spyOn(fs, 'stat').mockImplementation((_path: any, cb: any) =>
      cb(null, { mtime: oneHourAgo } as fs.Stats)
    );
    clearTmpUploadFiles();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('should handle stat error gracefully', () => {
    mockIsProduction = true;
    const unlinkSpy = vi.spyOn(fs, 'unlink');
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) =>
      cb(null, ['some-file.tmp'])
    );
    vi.spyOn(fs, 'stat').mockImplementation((_path: any, cb: any) => cb(new Error('stat error')));
    clearTmpUploadFiles();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('should handle unlink error gracefully', () => {
    mockIsProduction = true;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) => cb(null, ['old-file.tmp']));
    vi.spyOn(fs, 'stat').mockImplementation((_path: any, cb: any) =>
      cb(null, { mtime: threeHoursAgo } as fs.Stats)
    );
    vi.spyOn(fs, 'unlink').mockImplementation((_path: any, cb: any) =>
      cb(new Error('unlink error'))
    );
    expect(() => clearTmpUploadFiles()).not.toThrow();
  });

  it('should log deleted file path on success', () => {
    mockIsProduction = true;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    vi.spyOn(fs, 'readdir').mockImplementation((_path: any, cb: any) => cb(null, ['old-file.tmp']));
    vi.spyOn(fs, 'stat').mockImplementation((_path: any, cb: any) =>
      cb(null, { mtime: threeHoursAgo } as fs.Stats)
    );
    vi.spyOn(fs, 'unlink').mockImplementation((_path: any, cb: any) => cb(null));
    clearTmpUploadFiles();
  });
});
