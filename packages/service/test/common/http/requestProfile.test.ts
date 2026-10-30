import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRequestProfile: vi.fn((_options, run: () => Promise<unknown>) => run())
}));
vi.mock('@fastgpt/service/common/profiling', () => mocks);

import {
  REQUEST_PROFILE_HEADER,
  withHttpRequestProfile
} from '@fastgpt/service/common/http/requestProfile';

describe('withHttpRequestProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([undefined, '', '0', 'true', ['1'], ['1', '1']])(
    '没有明确单值 header=1 时不创建采集器：%j',
    async (value) => {
      const run = vi.fn(async () => 'business');
      expect(
        await withHttpRequestProfile(
          { headers: { [REQUEST_PROFILE_HEADER]: value }, kind: 'test' },
          run
        )
      ).toBe('business');
      expect(run).toHaveBeenCalledOnce();
      expect(mocks.withRequestProfile).not.toHaveBeenCalled();
    }
  );

  it('显式 header 开启时将整个业务管线交给采集器', async () => {
    const run = vi.fn(async () => ({ value: 1 }));
    expect(
      await withHttpRequestProfile(
        { headers: { [REQUEST_PROFILE_HEADER]: '1' }, kind: 'GET /api/test' },
        run
      )
    ).toEqual({ value: 1 });
    expect(mocks.withRequestProfile).toHaveBeenCalledExactlyOnceWith(
      { kind: 'GET /api/test' },
      run
    );
    expect(run).toHaveBeenCalledOnce();
  });
});
