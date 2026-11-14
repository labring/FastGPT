import { describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/support/user/account/captcha/getImgCaptcha';
import { verification } from '@fastgpt/service/support/tmpData/verification';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

describe('get puzzle captcha API', () => {
  it('returns only display data and stores the answer with the correct scope', async () => {
    const challenge = await handler(
      {
        query: { username: 'a@example.com', purpose: 'register' },
        headers: {}
      } as any,
      { setHeader: vi.fn() } as any
    );
    expect(challenge.challengeId).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.mode).toBe('rotate');
    expect(challenge.captchaImage).toMatch(/^data:image\/png;base64,/);
    expect(challenge).not.toHaveProperty('angle');
    expect(
      await verification.get({ scene: 'register', type: 'puzzle', key: challenge.challengeId })
    ).toMatchObject({ scopeKey: 'a@example.com', angle: expect.any(Number) });
  });
  it('keeps the existing contact-account boundary', async () => {
    await expect(
      handler(
        { query: { username: 'root', purpose: 'login' }, headers: {} } as any,
        { setHeader: vi.fn() } as any
      )
    ).rejects.toBeInstanceOf(ApiRequestInputParseError);
  });
});
