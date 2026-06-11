import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  rejectUnsupportedMethod,
  useAllowedMethods
} from '@fastgpt/service/common/middle/methodGuard';
import { jsonRes } from '@fastgpt/service/common/response';

const mockJsonRes = vi.mocked(jsonRes);

const createMockRes = () =>
  ({
    setHeader: vi.fn()
  }) as any;

describe('methodGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('允许声明的方法继续执行', () => {
    const res = createMockRes();
    const blocked = rejectUnsupportedMethod({
      req: { method: 'GET' } as any,
      res,
      methods: 'GET'
    });

    expect(blocked).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(mockJsonRes).not.toHaveBeenCalled();
  });

  it('非声明方法返回 405 并设置 Allow', () => {
    const res = createMockRes();
    const blocked = rejectUnsupportedMethod({
      req: { method: 'DELETE' } as any,
      res,
      methods: 'POST'
    });

    expect(blocked).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 405,
      error: 'Method not allowed'
    });
  });

  it('支持多个允许方法', async () => {
    const res = createMockRes();
    const middleware = useAllowedMethods(['GET', 'POST']);

    await middleware({ method: 'PATCH' } as any, res);

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST');
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 405,
      error: 'Method not allowed'
    });
  });
});
