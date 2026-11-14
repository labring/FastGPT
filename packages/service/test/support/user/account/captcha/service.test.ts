import { describe, expect, it, vi } from 'vitest';
import { PuzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { verification } from '@fastgpt/service/support/tmpData/verification';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const makeService = (angle = 140) => {
  let now = Date.now();
  const service = new PuzzleCaptchaService({
    assertCreateFrequency: vi.fn(async () => undefined),
    assertConsumeFrequency: vi.fn(async () => undefined),
    render: vi.fn(async () => ({
      angle,
      captchaImage: 'background',
      mode: 'rotate' as const,
      width: 224,
      height: 224
    })),
    now: () => now
  });
  return {
    service,
    advance: (duration: number) => {
      now += duration;
    }
  };
};
const track = [0, 30, 65, 100, 140].map((x, i) => ({ x, y: i % 2, t: i * 150 }));

describe('PuzzleCaptchaService', () => {
  it('issues a scoped proof only after consuming a correct challenge', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    expect(challenge).not.toHaveProperty('angle');
    expect(challenge).not.toHaveProperty('scopeKey');
    advance(700);
    const proof = await service.verify({
      challengeId: challenge.challengeId,
      purpose: 'register',
      angle: 140,
      track
    });
    if (proof.status !== 'passed') throw new Error('Expected a valid proof');
    expect(proof.captcha).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      verification.get({ type: 'captcha', scene: 'register', key: 'a@example.com' })
    ).resolves.toEqual({ code: proof.captcha });
    await expect(
      verification.get({ type: 'captcha', scene: 'login', key: 'a@example.com' })
    ).resolves.toBeNull();
    await expect(
      service.verify({ challengeId: challenge.challengeId, purpose: 'register', angle: 140, track })
    ).resolves.toEqual({ status: 'refreshRequired' });
  });

  it('joins the caller transaction for create and verify, including rollback', async () => {
    const { service, advance } = makeService();
    let challengeId = '';
    await expect(
      mongoSessionRun(async (session) => {
        const challenge = await service.create(
          { username: 'a@example.com', purpose: 'register' },
          session
        );
        challengeId = challenge.challengeId;
        advance(700);
        expect(
          await service.verify({ challengeId, purpose: 'register', angle: 140, track }, session)
        ).toHaveProperty('captcha');
        throw new Error('business rollback');
      })
    ).rejects.toThrow('business rollback');
    expect(
      await verification.get({ type: 'puzzle', scene: 'register', key: challengeId })
    ).toBeNull();
    expect(
      await verification.get({ type: 'captcha', scene: 'register', key: 'a@example.com' })
    ).toBeNull();
  });

  it('rolls back image consumption when proof persistence fails, keeping the claimed attempt', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const upsert = vi
      .spyOn(verification, 'upsert')
      .mockRejectedValueOnce(new Error('storage failed'));
    try {
      await expect(
        service.verify({
          challengeId: challenge.challengeId,
          purpose: 'register',
          angle: 140,
          track
        })
      ).rejects.toThrow('storage failed');
      expect(
        await verification.get({ type: 'puzzle', scene: 'register', key: challenge.challengeId })
      ).toMatchObject({ attempts: 1 });
      expect(
        await verification.get({ type: 'captcha', scene: 'register', key: 'a@example.com' })
      ).toBeNull();
    } finally {
      upsert.mockRestore();
    }
  });

  it.each([
    ['wrong angle', { angle: 150, track: track.map((p, i) => (i === 4 ? { ...p, x: 150 } : p)) }],
    ['instant movement', { angle: 140, track: track.map((p) => ({ ...p, t: 0 })) }],
    [
      'forged endpoint',
      { angle: 140, track: track.map((p, i) => (i === 4 ? { ...p, x: 130 } : p)) }
    ],
    ['time travel', { angle: 140, track: track.map((p) => ({ ...p, t: p.t * 100 })) }]
  ])('uses exactly three attempts on %s', async (_, submission) => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const verify = () =>
      service.verify({ ...submission, challengeId: challenge.challengeId, purpose: 'register' });
    await expect(verify()).resolves.toEqual({ status: 'retry', remainingAttempts: 2 });
    await expect(verify()).resolves.toEqual({ status: 'retry', remainingAttempts: 1 });
    await expect(verify()).resolves.toEqual({ status: 'refreshRequired' });
    await expect(verify()).resolves.toEqual({ status: 'refreshRequired' });
    await expect(
      verification.get({ type: 'captcha', scene: 'register', key: 'a@example.com' })
    ).resolves.toBeNull();
  });

  it.each([
    { angle: 134, allowed: true },
    { angle: 146, allowed: true },
    { angle: 147, allowed: false }
  ])('applies the six-degree tolerance at $angle degrees', async ({ angle, allowed }) => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const result = service.verify({
      challengeId: challenge.challengeId,
      purpose: 'register',
      angle,
      track: track.map((point, index) => (index === 4 ? { ...point, x: angle } : point))
    });
    if (allowed) await expect(result).resolves.toHaveProperty('captcha');
    else await expect(result).resolves.toEqual({ status: 'retry', remainingAttempts: 2 });
  });

  it('compares angles across the full-turn boundary', async () => {
    const { service, advance } = makeService(359);
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    await expect(
      service.verify({
        challengeId: challenge.challengeId,
        purpose: 'register',
        angle: 1,
        track: track.map((point, index) => (index === 4 ? { ...point, x: 1 } : point))
      })
    ).resolves.toHaveProperty('captcha');
  });

  it('rejects wrong scenes without consuming the intended scene, and rejects expired challenges', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    await expect(
      service.verify({ challengeId: challenge.challengeId, purpose: 'login', angle: 140, track })
    ).resolves.toEqual({ status: 'refreshRequired' });
    await verification.upsert({
      type: 'puzzle',
      scene: 'register',
      key: challenge.challengeId,
      data: { attempts: 0, angle: 140, scopeKey: 'a@example.com', createdAt: Date.now() },
      ttlPreset: 'short'
    });
    const { MongoTmpData } = await import('@fastgpt/service/support/tmpData/schema');
    await MongoTmpData.updateMany({}, { expireAt: new Date(Date.now() - 1) });
    await expect(
      service.verify({ challengeId: challenge.challengeId, purpose: 'register', angle: 140, track })
    ).resolves.toEqual({ status: 'refreshRequired' });
  });

  it('rejects creation before rendering when the account is rate limited', async () => {
    const render = vi.fn();
    const service = new PuzzleCaptchaService({
      render,
      assertCreateFrequency: async () => {
        throw new Error('rate limited');
      }
    });
    await expect(
      service.create({ username: 'a@example.com', purpose: 'register' })
    ).rejects.toThrow('rate limited');
    expect(render).not.toHaveBeenCalled();
  });

  it('does not replace an existing challenge if an ID collides', async () => {
    const service = new PuzzleCaptchaService({
      assertCreateFrequency: async () => undefined,
      randomToken: () => 'a'.repeat(64)
    });
    await service.create({ username: 'a@example.com', purpose: 'register' });
    await expect(
      service.create({ username: 'other@example.com', purpose: 'register' })
    ).rejects.toThrow('Failed to allocate');
    expect(
      await verification.get({ type: 'puzzle', scene: 'register', key: 'a'.repeat(64) })
    ).toMatchObject({ scopeKey: 'a@example.com' });
  });

  it('allows only one concurrent verification to issue a proof', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({
      username: 'a@example.com',
      purpose: 'login',
      scopeKey: 'challenge-scoped-captcha'
    });
    advance(700);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.verify({ challengeId: challenge.challengeId, purpose: 'login', angle: 140, track })
      )
    );
    expect(results.filter((r) => r.status === 'passed')).toHaveLength(1);
    await expect(
      verification.get({ type: 'captcha', scene: 'login', key: 'a@example.com' })
    ).resolves.toBeNull();
    expect(
      await verification.get({
        type: 'captcha',
        scene: 'login',
        key: 'challenge-scoped-captcha'
      })
    ).not.toBeNull();
  });
});

describe('per-image retry budget', () => {
  it('allows success after two failures, and consumes the successful image', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const wrong = {
      challengeId: challenge.challengeId,
      purpose: 'register' as const,
      angle: 200,
      track: track.map((p, i) => (i === 4 ? { ...p, x: 200 } : p))
    };
    expect(await service.verify(wrong)).toEqual({ status: 'retry', remainingAttempts: 2 });
    expect(await service.verify(wrong)).toEqual({ status: 'retry', remainingAttempts: 1 });
    expect(await service.verify({ ...wrong, angle: 140, track })).toHaveProperty('captcha');
    expect(await service.verify({ ...wrong, angle: 140, track })).toEqual({
      status: 'refreshRequired'
    });
  });

  it('allocates a fresh three-attempt budget when a new image is requested', async () => {
    const { service, advance } = makeService();
    const first = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const submission = {
      challengeId: first.challengeId,
      purpose: 'register' as const,
      angle: 200,
      track: track.map((p, i) => (i === 4 ? { ...p, x: 200 } : p))
    };
    expect(await service.verify(submission)).toEqual({ status: 'retry', remainingAttempts: 2 });
    const second = await service.create({ username: 'a@example.com', purpose: 'register' });
    expect(second.challengeId).not.toBe(first.challengeId);
    advance(700);
    expect(await service.verify({ ...submission, challengeId: second.challengeId })).toEqual({
      status: 'retry',
      remainingAttempts: 2
    });
  });

  it('does not let concurrent incorrect requests exceed three attempts', async () => {
    const { service, advance } = makeService();
    const challenge = await service.create({ username: 'a@example.com', purpose: 'register' });
    advance(700);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.verify({
          challengeId: challenge.challengeId,
          purpose: 'register',
          angle: 200,
          track: track.map((p, i) => (i === 4 ? { ...p, x: 200 } : p))
        })
      )
    );
    expect(results.filter((r) => r.status === 'retry')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'refreshRequired')).toHaveLength(6);
    expect(
      await verification.get({ type: 'puzzle', scene: 'register', key: challenge.challengeId })
    ).toBeNull();
    expect(
      await verification.get({ type: 'captcha', scene: 'register', key: 'a@example.com' })
    ).toBeNull();
  });
});
