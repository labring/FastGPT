import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDurationLog } from '@fastgpt/service/common/logger/timing';

const createLogger = () => ({
  debug: vi.fn(),
  warn: vi.fn()
});

/** 固定每个采样点的当前时间，让 durationMs 断言不依赖真实耗时。 */
const mockNowQueue = (timestamps: number[]) => {
  let index = 0;
  return vi.spyOn(Date, 'now').mockImplementation(() => timestamps[index++] ?? 0);
};

describe('withDurationLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs debug with call properties and summary for fast stages', async () => {
    const logger = createLogger();
    mockNowQueue([1000, 1040]);

    const result = await withDurationLog(
      {
        logger,
        message: 'Stage finished',
        properties: { stage: 'plugin.listTools', sources: ['system'] },
        summary: (items: string[]) => ({ toolCount: items.length })
      },
      async () => ['a', 'b']
    );

    expect(result).toEqual(['a', 'b']);
    expect(logger.debug).toHaveBeenCalledWith('Stage finished', {
      stage: 'plugin.listTools',
      sources: ['system'],
      toolCount: 2,
      durationMs: 40
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs warn when the stage reaches the slow threshold', async () => {
    const logger = createLogger();
    mockNowQueue([0, 1000]);

    await withDurationLog({ logger, message: 'Stage finished' }, async () => undefined);

    expect(logger.warn).toHaveBeenCalledWith('Stage finished', { durationMs: 1000 });
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('records the duration of failed stages and rethrows the original error', async () => {
    const logger = createLogger();
    mockNowQueue([0, 5000]);
    const error = new Error('plugin request timeout');

    await expect(
      withDurationLog(
        { logger, message: 'Stage finished', properties: { stage: 'plugin.debugSessionStatus' } },
        () => Promise.reject(error)
      )
    ).rejects.toBe(error);

    expect(logger.warn).toHaveBeenCalledWith('Stage finished', {
      stage: 'plugin.debugSessionStatus',
      durationMs: 5000,
      failed: true
    });
  });
});
