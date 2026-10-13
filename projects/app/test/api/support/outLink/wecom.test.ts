import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { forwardWecom } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import handler from '@/pages/api/support/outLink/wecom/[token]';

vi.mock('@fastgpt/service/thirdProvider/fastgptPro/api', () => ({
  forwardWecom: vi.fn()
}));

describe('WeCom outlink proxy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards callback method and sends encrypted response once', async () => {
    vi.mocked(forwardWecom).mockResolvedValue({
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
      body: { encrypt: 'encrypted-body' }
    } as any as ApiRequestProps<any, any>;
    const res = { send: vi.fn() } as any as ApiResponseType<any>;

    await handler(req, res);

    expect(forwardWecom).toHaveBeenCalledWith({
      token: 'share-id',
      method: 'POST',
      params: req.query,
      data: req.body
    });
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith('encrypted-response');
  });
});
