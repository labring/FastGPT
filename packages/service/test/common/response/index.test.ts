import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestInputParseError } from '../../../common/zod/requestParseError';

vi.unmock('@fastgpt/service/common/response');

const logger = {
  info: vi.fn(),
  error: vi.fn()
};

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => logger,
  LogCategories: {
    HTTP: {
      ERROR: 'http.error'
    }
  }
}));

const { processError } = await import('../../../common/response');

function buildZodError() {
  try {
    z.object({ name: z.string() }).parse({});
  } catch (error) {
    return error as z.ZodError;
  }

  throw new Error('Expected zod parse to fail');
}

describe('processError zod logging', () => {
  beforeEach(() => {
    logger.info.mockClear();
    logger.error.mockClear();
  });

  it('does not log request input ZodError through the otel logger', () => {
    const error = new ApiRequestInputParseError(buildZodError(), { inputSource: 'body' });
    const processed = processError({
      error,
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed.httpStatus).toBe(400);
    expect(processed.zodError).toBeTruthy();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not require an api key header context to suppress request input ZodError logs', () => {
    const error = new ApiRequestInputParseError(buildZodError(), { inputSource: 'query' });
    const processed = processError({
      error,
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed.httpStatus).toBe(400);
    expect(processed.zodError).toBeTruthy();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps unclassified ZodError at error level', () => {
    const error = buildZodError();
    processError({
      error,
      url: '/api/test',
      defaultCode: 500
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        url: '/api/test',
        error
      })
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
