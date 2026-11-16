import { describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/support/user/account/captcha/verify';
import { puzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import { verification } from '@fastgpt/service/support/tmpData/verification';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

describe('verify puzzle captcha API', () => {
  it('counts an undersampled drag as one failed attempt instead of forcing an early refresh', async () => {
    const challenge = await puzzleCaptchaService.create({
      username: 'short@example.com',
      purpose: 'register'
    });
    const body = {
      purpose: 'register',
      challengeId: challenge.challengeId,
      angle: 100,
      track: [
        { x: 0, y: 0, t: 0 },
        { x: 100, y: 0, t: 20 }
      ]
    };
    expect(await handler({ body, headers: {} } as any, { setHeader: vi.fn() } as any)).toEqual({
      status: 'retry',
      remainingAttempts: 2
    });
  });

  it('returns two retry results before requiring a fresh image', async () => {
    const challenge = await puzzleCaptchaService.create({
      username: 'retry@example.com',
      purpose: 'register'
    });
    const material = await verification.get({
      scene: 'register',
      type: 'puzzle',
      key: challenge.challengeId
    });
    const angle = (material!.angle + 180) % 360;
    const body = {
      purpose: 'register',
      challengeId: challenge.challengeId,
      angle,
      track: Array.from({ length: 6 }, (_, i) => ({ x: (angle * i) / 5, y: 0, t: i * 150 }))
    };
    for (const expected of [
      { status: 'retry', remainingAttempts: 2 },
      { status: 'retry', remainingAttempts: 1 },
      { status: 'refreshRequired' }
    ]) {
      expect(await handler({ body, headers: {} } as any, { setHeader: vi.fn() } as any)).toEqual(
        expected
      );
    }
  });

  it('accepts a completed drag and refuses replay', async () => {
    const challenge = await puzzleCaptchaService.create({
      username: 'a@example.com',
      purpose: 'register'
    });
    const material = await verification.get({
      scene: 'register',
      type: 'puzzle',
      key: challenge.challengeId
    });
    await verification.upsert({
      scene: 'register',
      type: 'puzzle',
      key: challenge.challengeId,
      data: { ...material!, createdAt: Date.now() - 1000 },
      ttlPreset: 'medium'
    });
    const body = {
      purpose: 'register',
      challengeId: challenge.challengeId,
      angle: material!.angle,
      track: Array.from({ length: 6 }, (_, i) => ({
        x: (material!.angle * i) / 5,
        y: i % 2,
        t: i * 150
      }))
    };
    const result = await handler({ body, headers: {} } as any, { setHeader: vi.fn() } as any);
    if (result.status !== 'passed') throw new Error('Expected proof');
    expect(result.captcha).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      handler({ body, headers: {} } as any, { setHeader: vi.fn() } as any)
    ).resolves.toEqual({ status: 'refreshRequired' });
  });
  it.each([
    { challengeId: 'invalid', angle: 100, track: [] },
    {
      challengeId: 'a'.repeat(64),
      angle: 100,
      track: Array.from({ length: 257 }, () => ({ x: 0, y: 0, t: 0 }))
    },
    {
      challengeId: 'a'.repeat(64),
      angle: -1,
      track: Array.from({ length: 5 }, () => ({ x: 0, y: 0, t: 0 }))
    }
  ])('rejects malformed or unbounded submissions before verification', async (body) => {
    await expect(
      handler(
        { body: { ...body, purpose: 'register' }, headers: {} } as any,
        { setHeader: vi.fn() } as any
      )
    ).rejects.toBeInstanceOf(ApiRequestInputParseError);
  });
});
