import { describe, it, expect } from 'vitest';
import {
  normalizePagination,
  parsePaginationRequest
} from '@fastgpt/service/common/api/pagination';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { NodeApiRequest } from '@fastgpt/service/types/http';

describe('normalizePagination', () => {
  it.each([
    { input: {}, expected: { pageSize: 20, offset: 0 } },
    { input: { pageNum: 3 }, expected: { pageSize: 20, offset: 40 } },
    { input: { pageSize: 50, pageNum: 2 }, expected: { pageSize: 50, offset: 50 } },
    { input: { pageSize: 50, pageNum: 2, offset: 0 }, expected: { pageSize: 50, offset: 0 } },
    { input: { pageSize: 50, pageNum: 2, offset: 75 }, expected: { pageSize: 50, offset: 75 } }
  ])('preserves business defaults and offset priority: $input', ({ input, expected }) => {
    expect(normalizePagination(input)).toEqual(expected);
  });
});

describe('parsePaginationRequest', () => {
  // 只构造此 helper 实际读取的请求字段，边界校验仍执行真实的 parseApiInput。
  const parse = (body?: unknown, query?: unknown) =>
    parsePaginationRequest({ body, query } as NodeApiRequest);

  describe.each(['body', 'query'] as const)('%s input', (source) => {
    it.each([
      { input: { pageSize: '15', pageNum: '4' }, expected: { pageSize: 15, offset: 45 } },
      { input: { offset: '10' }, expected: { pageSize: 20, offset: 10 } },
      { input: { pageNum: '3' }, expected: { pageSize: 20, offset: 40 } },
      { input: { pageSize: '1000', pageNum: '3' }, expected: { pageSize: 500, offset: 1000 } },
      { input: { offset: '0', pageNum: 'ignored' }, expected: { pageSize: 20, offset: 0 } }
    ])('normalizes $input', ({ input, expected }) => {
      expect(source === 'body' ? parse(input) : parse(undefined, input)).toEqual(expected);
    });

    it('classifies invalid selected-mode parameters as request input errors', () => {
      for (const input of [{ pageSize: 0 }, { offset: 'invalid', pageNum: 2 }, { pageNum: 0 }]) {
        expect(() => (source === 'body' ? parse(input) : parse(undefined, input))).toThrow(
          ApiRequestInputParseError
        );
      }
    });
  });

  it.each([
    {
      body: { offset: 10 },
      query: { pageSize: '30', pageNum: '3' },
      expected: { pageSize: 20, offset: 10 }
    },
    { body: { offset: 0 }, query: { offset: '30' }, expected: { pageSize: 20, offset: 0 } },
    { body: { pageNum: 3 }, query: { offset: '30' }, expected: { pageSize: 20, offset: 40 } },
    { body: { pageSize: 30 }, query: { offset: '30' }, expected: { pageSize: 30, offset: 0 } },
    {
      body: { searchText: 'unrelated' },
      query: { offset: '30' },
      expected: { pageSize: 20, offset: 30 }
    },
    { body: {}, query: {}, expected: { pageSize: 20, offset: 0 } },
    { body: null, query: { offset: '10' }, expected: { pageSize: 20, offset: 10 } },
    { body: { offset: 10 }, query: undefined, expected: { pageSize: 20, offset: 10 } }
  ])(
    'selects one complete source, preferring body: $body / $query',
    ({ body, query, expected }) => {
      expect(parse(body, query)).toEqual(expected);
    }
  );
});
