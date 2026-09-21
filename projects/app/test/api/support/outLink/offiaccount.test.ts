import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { forwardOffiaccount } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import handler from '@/pages/api/support/outLink/offiaccount/[token]';

vi.mock('@fastgpt/service/thirdProvider/fastgptPro/api', () => ({
  forwardOffiaccount: vi.fn()
}));

describe('Official account outlink proxy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards an encrypted passive reply exactly once', async () => {
    vi.mocked(forwardOffiaccount).mockResolvedValue({
      data: { data: { message: 'encrypted-response' } }
    } as any);
    const req = {
      method: 'POST',
      query: {
        token: 'share-id',
        msg_signature: 'signature',
        timestamp: 'timestamp',
        nonce: 'nonce'
      },
      body: '<xml><Encrypt>encrypted-body</Encrypt></xml>'
    } as any as ApiRequestProps<any, any>;
    const res = { send: vi.fn() } as any as ApiResponseType<any>;

    await handler(req, res);

    expect(forwardOffiaccount).toHaveBeenCalledWith({
      token: 'share-id',
      method: 'POST',
      params: req.query,
      data: req.body
    });
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith('encrypted-response');
  });
});
