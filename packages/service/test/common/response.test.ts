import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const createRes = () =>
  ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  }) as any;

describe('response', () => {
  it('should not return zodError in json response body', async () => {
    const { jsonRes } = await vi.importActual<typeof import('@fastgpt/service/common/response')>(
      '@fastgpt/service/common/response'
    );
    const result = z
      .object({
        name: z.string()
      })
      .safeParse({
        name: 123
      });

    expect(result.success).toBe(false);
    if (result.success) return;

    const res = createRes();

    jsonRes(res, {
      code: 400,
      message: 'Data validation error',
      error: result.error,
      url: '/api/test'
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 400,
      statusText: 'error',
      message: 'Data validation error',
      data: null
    });
  });
});
