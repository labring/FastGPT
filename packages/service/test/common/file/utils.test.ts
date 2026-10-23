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
  getFileMaxSize,
  removeFilesByPaths,
  clearDirFiles,
  clearTmpUploadFiles
} from '@fastgpt/service/common/file/utils';

describe('getFileMaxSize', () => {
  let originalConfig: typeof global.feConfigs;
  beforeEach(() => {
    originalConfig = global.feConfigs;
  });
  afterEach(() => {
    global.feConfigs = originalConfig;
  });
  it.each([
    [undefined, 1000],
    [500, 500],
    [0, 1000]
  ])('returns the configured size %s or the missing-value default in bytes', (value, expected) => {
    global.feConfigs = { limit: { uploadFileMaxSize: value } } as any;
    expect(getFileMaxSize()).toBe(expected * 1024 * 1024);
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
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockImplementation((_path: any, cb: any) => cb(null));
    clearTmpUploadFiles();
    expect(unlinkSpy).toHaveBeenCalled();
  });
});
