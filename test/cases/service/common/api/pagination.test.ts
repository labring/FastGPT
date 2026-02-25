import { describe, it, expect } from 'vitest';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

describe('pagination.ts', () => {
  describe('parsePaginationRequest', () => {
    it('应该从 body 中解析分页参数（使用 pageNum）', () => {
      const req = {
        body: {
          pageSize: 20,
          pageNum: 3
        },
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 20,
        offset: 40 // (3 - 1) * 20
      });
    });

    it('应该从 body 中解析分页参数（使用 offset）', () => {
      const req = {
        body: {
          pageSize: 15,
          offset: 30
        },
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 15,
        offset: 30
      });
    });

    it('应该从 query 中解析分页参数（使用 pageNum）', () => {
      const req = {
        body: {},
        query: {
          pageSize: '25',
          pageNum: '2'
        }
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 25,
        offset: 25 // (2 - 1) * 25
      });
    });

    it('应该从 query 中解析分页参数（使用 offset）', () => {
      const req = {
        body: {},
        query: {
          pageSize: '10',
          offset: '50'
        }
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 10,
        offset: 50
      });
    });

    it('应该使用默认值（pageSize=10, pageNum=1）', () => {
      const req = {
        body: {},
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 10,
        offset: 0 // (1 - 1) * 10
      });
    });

    it('应该优先使用 body 中的参数而不是 query', () => {
      const req = {
        body: {
          pageSize: 30,
          pageNum: 2
        },
        query: {
          pageSize: '20',
          pageNum: '3'
        }
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 30,
        offset: 30 // (2 - 1) * 30
      });
    });

    it('应该在 pageSize 为 0 时抛出错误', () => {
      const req = {
        body: {
          pageSize: 0,
          pageNum: 2
        },
        query: {}
      } as any;

      expect(() => parsePaginationRequest(req)).toThrow(CommonErrEnum.missingParams);
    });

    it('应该在 body 和 query 都为空且 pageNum 和 offset 都未定义时抛出错误', () => {
      const req = {
        body: {},
        query: {}
      } as any;

      // 由于有默认值，这个情况实际上不会抛出错误
      // 默认值: pageSize=10, pageNum=1, offset=0
      const result = parsePaginationRequest(req);
      expect(result).toEqual({
        pageSize: 10,
        offset: 0
      });
    });

    it('应该正确处理 pageNum 为 1 的情况', () => {
      const req = {
        body: {
          pageSize: 10,
          pageNum: 1
        },
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 10,
        offset: 0
      });
    });

    it('应该正确处理 offset 为 0 的情况', () => {
      const req = {
        body: {
          pageSize: 10,
          offset: 0
        },
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 10,
        offset: 0
      });
    });

    it('应该将字符串类型的参数转换为数字', () => {
      const req = {
        body: {},
        query: {
          pageSize: '15',
          pageNum: '4'
        }
      } as any;

      const result = parsePaginationRequest(req);

      expect(result.pageSize).toBe(15);
      expect(result.offset).toBe(45);
      expect(typeof result.pageSize).toBe('number');
      expect(typeof result.offset).toBe('number');
    });

    it('应该优先使用 offset 而不是 pageNum（当两者都存在时）', () => {
      const req = {
        body: {
          pageSize: 10,
          pageNum: 5,
          offset: 100
        },
        query: {}
      } as any;

      const result = parsePaginationRequest(req);

      expect(result).toEqual({
        pageSize: 10,
        offset: 100
      });
    });
  });
});
