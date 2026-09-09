import { ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseProcessPool, type PoolWorker } from '../../src/pool/base-process-pool';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('../../src/utils/logger', () => ({
  getLogger: () => ({ error: logError }),
  LogCategories: { MODULE: { SANDBOX: { SERVER: ['sandbox', 'server'] } } }
}));

class ResponseTestPool extends BaseProcessPool {
  constructor() {
    super(1, {
      name: 'ResponseTest',
      workerScript: '',
      spawnCommand: () => '',
      allowedModules: []
    });
  }

  /** 直接驱动行协议，避免为日志测试启动真实沙箱进程。 */
  run(worker: PoolWorker) {
    return this.sendTask(worker, { code: 'test', variables: {}, timeoutMs: 1000 }, 1000);
  }
}

describe('BaseProcessPool worker response logging', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ['debug: task started', 'SyntaxError'],
    ['null', 'TypeError']
  ])('记录响应 %s 的完整异常并返回具体原因', async (line, errorName) => {
    const proc = new ChildProcess();
    proc.stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const rl = createInterface({ input: stdout });
    const stderrRl = createInterface({ input: stderr });
    const worker: PoolWorker = { proc, rl, stderrRl, busy: true, id: 7, stderrBuf: [] };

    try {
      const result = new ResponseTestPool().run(worker);
      rl.emit('line', line);

      await expect(result).resolves.toEqual({
        success: false,
        message: expect.stringMatching(new RegExp(`^Invalid worker response: ${errorName}: .+`))
      });
      expect(logError).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('failed to parse or handle worker response'),
        {
          workerId: 7,
          responseLength: line.length,
          error: expect.stringContaining(errorName)
        }
      );
      expect(logError.mock.calls[0][1].error).toContain('at ');
      expect(rl.listenerCount('line')).toBe(0);
    } finally {
      rl.close();
      stderrRl.close();
      stdout.destroy();
      stderr.destroy();
      proc.stdin.destroy();
    }
  });
});
