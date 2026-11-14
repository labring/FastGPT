import { describe, expect, it, vi } from 'vitest';
import { createPasswordLoginStrategy } from '../../src/domain/auth/strategies/password-login';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import type { Prompter } from '../../src/infra/ui/prompter';
import type { LoginStrategyContext } from '../../src/domain/auth/strategies/login-strategy';

const challenge = {
  challengeId: 'a'.repeat(64),
  captchaImage: 'data:image/png;base64,AAAA',
  mode: 'rotate' as const,
  width: 224,
  height: 224,
  expiresAt: '2099-01-01T00:00:00.000Z'
};
const userId = '68ad85a7463006c963799a01';
const user = {
  _id: userId,
  username: 'alice',
  timezone: 'Asia/Shanghai',
  hasPassword: true,
  status: 'active',
  permission: {},
  team: {
    userId,
    teamId: userId,
    tmbId: userId,
    teamName: 'Team',
    memberName: 'Alice',
    status: 'active',
    permission: {}
  }
};
const context = (request: unknown): LoginStrategyContext => ({
  input: { username: 'alice', passwordStdin: true, language: 'en' },
  client: { request } as FastGptHttpClient,
  prompter: {
    isInteractive: true,
    spinner: () => ({ start: vi.fn(), stop: vi.fn() })
  } as unknown as Prompter,
  readStdin: async () => 'secret-password'
});

describe('CLI password login risk puzzle', () => {
  it('solves a risk challenge and fetches a fresh pre-login code before retrying', async () => {
    let preLoginCount = 0;
    let loginCount = 0;
    const cleanup = vi.fn(async () => undefined);
    const request = vi.fn(async ({ path, body }) => {
      if (path.endsWith('/preLogin')) return { code: `pre-${++preLoginCount}` };
      if (path.endsWith('/captcha/verify')) {
        expect(body.purpose).toBe('login');
        expect(body.challengeId).toBe(challenge.challengeId);
        return { status: 'passed', captcha: 'b'.repeat(64) };
      }
      expect(body.password).toMatch(/^[a-f0-9]{64}$/);
      if (++loginCount === 1) return { status: 'captchaRequired', captcha: challenge };
      expect(body.captcha).toBe('b'.repeat(64));
      expect(body.code).toBe('pre-2');
      return { user, token: 'login-token' };
    });
    const result = await createPasswordLoginStrategy().authenticate({
      ...context(request),
      captchaPreviewer: async ({ challenge, verify }) => ({
        url: 'http://127.0.0.1',
        opened: true,
        cleanup,
        solution: verify({
          challengeId: challenge.challengeId,
          angle: 100,
          track: [0, 25, 50, 75, 100].map((x, i) => ({ x, y: 0, t: i * 150 }))
        }).then((result) => {
          if (result.status !== 'passed') throw new Error('Expected proof');
          return result.captcha;
        })
      })
    });
    expect(result).toEqual({ authType: 'token', secret: 'login-token' });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(preLoginCount).toBe(2);
  });

  it('does not bypass a required puzzle in non-interactive mode', async () => {
    const request = vi.fn(async ({ path }) =>
      path.endsWith('/preLogin')
        ? { code: 'pre' }
        : { status: 'captchaRequired', captcha: challenge }
    );
    const ctx = context(request);
    ctx.prompter = { ...ctx.prompter, isInteractive: false };
    await expect(createPasswordLoginStrategy().authenticate(ctx)).rejects.toThrow(
      'requires image rotation verification'
    );
  });
});
