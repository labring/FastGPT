import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { serviceEnv } from '@fastgpt/service/env';
import { AGENT_SANDBOX_PROXY_HEADER, authAgentSandboxProxy } from '@/service/core/sandbox/auth';

const originalSecret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;

describe('authAgentSandboxProxy', () => {
  beforeEach(() => {
    serviceEnv.AGENT_SANDBOX_PROXY_SECRET = 'proxy-secret';
  });

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_PROXY_SECRET = originalSecret;
  });

  it('returns proxy secret when header token matches', () => {
    const result = authAgentSandboxProxy({
      headers: {
        [AGENT_SANDBOX_PROXY_HEADER]: 'proxy-secret'
      }
    } as any);

    expect(result).toBe('proxy-secret');
  });

  it('throws authorization error when header token is missing or invalid', () => {
    expect(() => authAgentSandboxProxy({ headers: {} } as any)).toThrow(ERROR_ENUM.unAuthorization);
    expect(() =>
      authAgentSandboxProxy({
        headers: {
          [AGENT_SANDBOX_PROXY_HEADER]: 'wrong-secret'
        }
      } as any)
    ).toThrow(ERROR_ENUM.unAuthorization);
  });
});
