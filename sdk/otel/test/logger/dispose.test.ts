import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLogger, disposeLogger, getLogger } from '../../src/logger';

describe('disposeLogger', () => {
  afterEach(async () => {
    await disposeLogger();
    vi.restoreAllMocks();
  });

  it('synchronously flushes buffered non-blocking console logs on dispose', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await configureLogger({
      console: { enabled: true, level: 'info' },
      otel: false
    });

    const logger = getLogger(['test', 'dispose']);
    logger.error('Fatal flush check', { status: 500 });

    await disposeLogger();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Fatal flush check');
  });
});
