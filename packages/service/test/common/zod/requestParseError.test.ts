import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiRequestInputParseError,
  getZodParseErrorInputSource,
  parseApiInput
} from '../../../common/zod/requestParseError';

const schema = z.object({
  name: z.string()
});

describe('getZodParseErrorInputSource', () => {
  it('returns parsed inputs for provided schemas', () => {
    const result = parseApiInput({
      req: {
        body: { name: 'body-name' },
        query: { name: 'query-name' },
        params: { name: 'params-name' }
      },
      bodySchema: schema,
      querySchema: schema,
      paramsSchema: schema
    });

    expect(result.body.name).toBe('body-name');
    expect(result.query.name).toBe('query-name');
    expect(result.params.name).toBe('params-name');
  });

  it('detects direct req.body parse failures in API-like routes', () => {
    try {
      parseApiInput({ req: { body: {}, query: {}, params: {} }, bodySchema: schema });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestInputParseError);
      expect((error as ApiRequestInputParseError).cause).toBeInstanceOf(z.ZodError);
      expect(getZodParseErrorInputSource(error)?.inputSource).toBe('body');
    }
  });

  it('detects direct req.query parse failures in API-like routes', () => {
    try {
      parseApiInput({ req: { body: {}, query: {}, params: {} }, querySchema: schema });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestInputParseError);
      expect(getZodParseErrorInputSource(error)?.inputSource).toBe('query');
    }
  });

  it('detects direct req.params parse failures in API-like routes', () => {
    try {
      parseApiInput({ req: { body: {}, query: {}, params: {} }, paramsSchema: schema });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestInputParseError);
      expect(getZodParseErrorInputSource(error)?.inputSource).toBe('params');
    }
  });

  it('does not classify internal schema parse failures', () => {
    try {
      schema.parse({});
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect(getZodParseErrorInputSource(error)).toBeUndefined();
    }
  });
});
