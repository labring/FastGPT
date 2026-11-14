import { describe, expect, it, vi } from 'vitest';
import {
  LoginRiskService,
  getPasswordLoginCaptchaScope
} from '@fastgpt/service/support/user/account/login/risk/service';

const context = { username: 'alice', ip: '127.0.0.1', userAgent: 'Mozilla/5.0 Chrome/120' };
const makeCache = () => ({
  recordAttempt: vi.fn(async () => ({ account: 1, ip: 1 })),
  getFailures: vi.fn(async () => ({ account: 0, ip: 0 })),
  recordFailure: vi.fn(async () => undefined)
});

describe('LoginRiskService', () => {
  it('does not challenge normal traffic and uses a distinct proof scope', async () => {
    const cache = makeCache();
    expect(await new LoginRiskService(cache).requiresCaptcha(context)).toBe(false);
    expect(getPasswordLoginCaptchaScope('alice')).toBe('password-login:alice');
    expect(cache.recordAttempt).toHaveBeenCalledWith({
      account: expect.stringMatching(/^[a-f0-9]{64}$/),
      ip: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it.each([
    { attempts: { account: 5, ip: 1 } },
    { attempts: { account: 1, ip: 21 } },
    { failures: { account: 3, ip: 0 } },
    { failures: { account: 0, ip: 10 } },
    { automated: true },
    { userAgent: 'HeadlessChrome/120' },
    { userAgent: '' }
  ])('requires a puzzle for risk signal %j', async ({ attempts, failures, ...overrides }) => {
    const cache = makeCache();
    if (attempts) cache.recordAttempt.mockResolvedValue(attempts);
    if (failures) cache.getFailures.mockResolvedValue(failures);
    expect(await new LoginRiskService(cache).requiresCaptcha({ ...context, ...overrides })).toBe(
      true
    );
  });

  it('requires a puzzle if risk storage fails and preserves original failures', async () => {
    const cache = makeCache();
    cache.getFailures.mockRejectedValue(new Error('Redis unavailable'));
    cache.recordFailure.mockRejectedValue(new Error('Redis unavailable'));
    const service = new LoginRiskService(cache);
    expect(await service.requiresCaptcha(context)).toBe(true);
    await expect(service.recordFailure(context)).resolves.toBeUndefined();
  });
});
