import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MAX_HTML_TRANSFORM_CHARS: 1_000_000,
    PARSE_FILE_WORKER_MEMORY_LIMIT_MB: 640,
    XLSX_PARSE_MAX_ROWS: 100_000,
    XLSX_PARSE_MAX_COLUMNS: 1_000,
    XLSX_PARSE_MAX_CELLS: 1_000_000,
    XLSX_PARSE_MAX_MERGED_CELLS: 1_000_000,
    XLSX_PARSE_MAX_UNCOMPRESSED_BYTES: 134_217_728
  }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { getSafeEnv, WorkerPool, WorkerNameEnum } = await import('@fastgpt/service/worker/utils');

const workerScript = `
const { parentPort } = require('worker_threads');

parentPort.on('message', (message) => {
  const { id } = message;

  parentPort.once('message', (response) => {
    if (response.type === 'uploadFileResult') {
      parentPort.postMessage({
        id,
        type: 'success',
        data: response.data
      });
      return;
    }

    parentPort.postMessage({
      id,
      type: 'error',
      data: response.data
    });
  });

  parentPort.postMessage({
    id,
    type: 'uploadFile',
    requestId: 'upload-1',
    data: {
      name: 'image.png',
      mime: 'image/png',
      buffer: new Uint8Array([1, 2, 3]).buffer
    }
  });
});
`;

describe('worker/utils getSafeEnv', () => {
  it('将 XLSX 解析限制透传给 worker', () => {
    expect(getSafeEnv()).toMatchObject({
      XLSX_PARSE_MAX_ROWS: '100000',
      XLSX_PARSE_MAX_COLUMNS: '1000',
      XLSX_PARSE_MAX_CELLS: '1000000',
      XLSX_PARSE_MAX_MERGED_CELLS: '1000000',
      XLSX_PARSE_MAX_UNCOMPRESSED_BYTES: '134217728'
    });
  });
});

describe('worker/utils WorkerPool', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-worker-test-'));
    fs.mkdirSync(path.join(tmpDir, 'worker'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'worker', 'readFile.js'), workerScript);
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('处理 worker 通用 uploadFile 中间事件，不提前结束任务', async () => {
    const pool = new WorkerPool<{ payload: string }, { key: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1
    });
    const uploadFile = vi.fn().mockResolvedValue({
      key: 'parsed/image.png'
    });

    const result = await pool.run({ payload: 'run' }, undefined, { uploadFile });

    expect(uploadFile).toHaveBeenCalledWith({
      name: 'image.png',
      mime: 'image/png',
      buffer: expect.any(ArrayBuffer)
    });
    expect(result).toEqual({
      key: 'parsed/image.png'
    });
    expect(pool.workerQueue[0].status).toBe('idle');
    expect(pool.workerQueue[0].worker.resourceLimits.maxOldGenerationSizeMb).toBe(640);
  });

  it('uploadFile handler 失败时把错误回传给 worker', async () => {
    const pool = new WorkerPool<{ payload: string }, { key: string; src: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1
    });
    const uploadError = new Error('upload failed');
    const uploadFile = vi.fn().mockRejectedValue(uploadError);

    await expect(pool.run({ payload: 'run' }, undefined, { uploadFile })).rejects.toEqual(
      uploadError
    );
  });
});
