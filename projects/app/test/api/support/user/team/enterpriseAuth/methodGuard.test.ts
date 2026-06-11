import { describe, expect, it, vi, beforeEach } from 'vitest';
import { jsonRes } from '@fastgpt/service/common/response';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

const mockJsonRes = vi.mocked(jsonRes);

function makeMockRes() {
  return {
    setHeader: vi.fn()
  } as any;
}

describe('enterpriseAuth method guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('允许 OpenAPI 声明的方法继续执行', () => {
    const res = makeMockRes();
    const blocked = rejectUnsupportedEnterpriseAuthMethod({
      req: { method: 'GET' } as any,
      res,
      method: 'GET'
    });

    expect(blocked).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(mockJsonRes).not.toHaveBeenCalled();
  });

  it('非声明方法返回 405 并设置 Allow', () => {
    const res = makeMockRes();
    const blocked = rejectUnsupportedEnterpriseAuthMethod({
      req: { method: 'DELETE' } as any,
      res,
      method: 'POST'
    });

    expect(blocked).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 405,
      error: 'Method not allowed'
    });
  });
});
