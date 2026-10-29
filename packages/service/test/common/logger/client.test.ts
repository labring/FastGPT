import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserError, UserConfigError } from '@fastgpt/global/common/error/utils';
import { configureLogger, getLogger } from '@fastgpt/service/common/logger/client';
import { LogCategories } from '@fastgpt/service/common/logger/categories';
import { createLoggerOptionsFromEnv } from '../../../../../sdk/otel/src/logger/env';
import { createSinks } from '../../../../../sdk/otel/src/logger/sinks';

const sdk = vi.hoisted(() => {
  vi.resetModules();
  return { getLogger: vi.fn(), configureLoggerFromEnv: vi.fn(), otel: vi.fn() };
});
vi.mock('@fastgpt-sdk/otel/logger', () => ({
  getLogger: sdk.getLogger,
  configureLoggerFromEnv: sdk.configureLoggerFromEnv,
  disposeLogger: vi.fn()
}));
vi.mock('../../../../../sdk/otel/src/logger/otel', () => ({
  getOpenTelemetrySink: () => sdk.otel
}));

describe('configureLogger', () => {
  it('keeps application and pro configuration logs out of OTel while exporting normal logs', async () => {
    await configureLogger();
    const options = createLoggerOptionsFromEnv({
      ...sdk.configureLoggerFromEnv.mock.calls[0][0],
      env: { LOG_ENABLE_OTEL: true, LOG_OTEL_LEVEL: 'info' }
    });
    const { sinks } = await createSinks({ ...options, console: false });
    const config = {
      systemEnv: {
        customPdfParse: {
          key: 'test-pdf-key',
          somarkApiKey: 'test-somark-key',
          doc2xKey: 'test-doc2x-key',
          textinSecretCode: 'test-textin-secret'
        }
      }
    };
    const record = {
      category: ['system'],
      level: 'info' as const,
      message: ['System ready'],
      rawMessage: 'System ready',
      timestamp: 0,
      properties: { ready: true }
    };

    // 对应主应用启动、pro 启动和配置刷新，均未显式设置 otel: false。
    for (const message of [
      'System config loaded',
      'Pro system config loaded',
      'PRO system config refreshed'
    ]) {
      sinks.otel?.({
        ...record,
        message: [message],
        rawMessage: message,
        properties: { fastgpt: config, fastgptPro: { token: 'test-pro-token' } }
      });
    }
    expect(sdk.otel).not.toHaveBeenCalled();

    sinks.otel?.(record);
    expect(sdk.otel).toHaveBeenCalledExactlyOnceWith(record);
  });
});

const createBackend = () => ({
  category: LogCategories.MODULE.WORKFLOW.DISPATCH,
  error: vi.fn(),
  warn: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  getChild: vi.fn(),
  with: vi.fn()
});

describe('getLogger', () => {
  let backend: ReturnType<typeof createBackend>;
  const configError = new UserConfigError('Invalid key', undefined, {
    cause: new Error('Unauthorized')
  });

  beforeEach(() => {
    backend = createBackend();
    sdk.getLogger.mockReturnValue(backend);
  });

  it.each(['error', 'warn', 'warning'] as const)(
    'downgrades %s with a config error to local info and preserves its context',
    (level) => {
      const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
      const properties = Object.freeze({ error: configError, nodeId: 'search', otel: true });

      logger[level]('Dataset search failed', properties);

      expect(backend[level]).not.toHaveBeenCalled();
      expect(backend.info).toHaveBeenCalledExactlyOnceWith('Dataset search failed', {
        error: configError,
        nodeId: 'search',
        otel: false
      });
      expect(backend.info.mock.calls[0][1].error).toBe(configError);
      expect(properties.otel).toBe(true);
      expect(configError.cause).toBeInstanceOf(Error);
    }
  );

  it.each([
    new Error('Database unavailable'),
    new UserError('Business error'),
    new Error('Internal wrapper', { cause: configError })
  ])('keeps an unclassified failure at its requested severity: %s', (error) => {
    const logger = getLogger();
    const properties = { error, nodeId: 'search' };

    logger.error('Dataset search failed', properties);
    logger.warn('Dataset search failed', properties);

    expect(backend.error).toHaveBeenCalledExactlyOnceWith('Dataset search failed', properties);
    expect(backend.warn).toHaveBeenCalledExactlyOnceWith('Dataset search failed', properties);
    expect(backend.info).not.toHaveBeenCalled();
  });

  it('recognizes the serialized UserConfigError identity', () => {
    const error = { name: 'UserConfigError', message: 'Invalid key' };

    getLogger().error('Dataset search failed', { error });

    expect(backend.info).toHaveBeenCalledExactlyOnceWith('Dataset search failed', {
      error,
      otel: false
    });
  });

  it('supports structured properties without a message', () => {
    getLogger().error({ error: configError, nodeId: 'search' });

    expect(backend.info).toHaveBeenCalledExactlyOnceWith({
      error: configError,
      nodeId: 'search',
      otel: false
    });
  });

  it('supports the direct Error overloads', () => {
    const logger = getLogger();

    logger.error(configError);
    logger.error('Dataset search failed', configError);

    expect(backend.info.mock.calls).toEqual([
      [{ error: configError, otel: false }],
      ['Dataset search failed', { error: configError, otel: false }]
    ]);
  });

  it.each(['getChild', 'with'] as const)('retains the policy on %s loggers', (method) => {
    const child = createBackend();
    backend[method].mockReturnValue(child);
    const logger = getLogger();
    const derived =
      method === 'getChild' ? logger.getChild('search') : logger.with({ nodeId: '1' });

    derived.error('Dataset search failed', { error: configError });

    expect(child.error).not.toHaveBeenCalled();
    expect(child.info).toHaveBeenCalledExactlyOnceWith('Dataset search failed', {
      error: configError,
      otel: false
    });
  });

  it('preserves categories, binding and other log methods', () => {
    backend.debug.mockImplementation(function (this: typeof backend) {
      expect(this).toBe(backend);
    });
    const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
    const properties = { error: configError };

    logger.debug('Diagnostic', properties);
    logger.info('Diagnostic', properties);

    expect(sdk.getLogger).toHaveBeenLastCalledWith(LogCategories.MODULE.WORKFLOW.DISPATCH);
    expect(logger.category).toBe(backend.category);
    expect(backend.debug).toHaveBeenCalledExactlyOnceWith('Diagnostic', properties);
    expect(backend.info).toHaveBeenCalledExactlyOnceWith('Diagnostic', properties);
  });

  it('preserves lazy properties and tagged template overloads', () => {
    const logger = getLogger();
    const properties = vi.fn(() => ({ error: configError }));

    logger.error('Lazy properties', properties);
    void logger.error`Request failed: ${configError}`;

    expect(properties).not.toHaveBeenCalled();
    expect(backend.error).toHaveBeenCalledWith('Lazy properties', properties);
    expect(backend.error.mock.calls[1][0]).toEqual(['Request failed: ', '']);
    expect(backend.error.mock.calls[1][1]).toBe(configError);
    expect(backend.info).not.toHaveBeenCalled();
  });
});
