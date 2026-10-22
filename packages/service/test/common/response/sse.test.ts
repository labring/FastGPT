import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { createSseStreamContext } from '@fastgpt/service/common/response/sse';

describe('SSE stream resume cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { stream: true, failedStep: 'flush' },
    { stream: true, failedStep: 'shrinkTTLAfterComplete' },
    { stream: false, failedStep: 'flush' },
    { stream: false, failedStep: 'shrinkTTLAfterComplete' }
  ] as const)('handles $failedStep errors with stream=$stream', async ({ stream, failedStep }) => {
    const error = new Error('Resume cleanup failed');
    const mirror = {
      flush: vi.fn(async () => undefined),
      shrinkTTLAfterComplete: vi.fn(async () => undefined)
    };
    mirror[failedStep].mockRejectedValueOnce(error);
    const errorLog = vi
      .spyOn(getLogger(LogCategories.HTTP.RESPONSE), 'error')
      .mockImplementation(() => undefined);
    const context = createSseStreamContext({
      stream,
      res: {
        headersSent: true,
        once: vi.fn(),
        on: vi.fn()
      } as unknown as NonNullable<Parameters<typeof createSseStreamContext>[0]['res']>,
      streamResumeMirror: mirror
    });

    await expect(context.flushResume()).resolves.toBeUndefined();

    expect(mirror.flush).toHaveBeenCalledOnce();
    expect(mirror.shrinkTTLAfterComplete).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith(expect.any(String), { error });
    context.cleanup();
  });
});
