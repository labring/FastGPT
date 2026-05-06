import jwt from 'jsonwebtoken';
import { env } from '../../env';
import type { ProxyTokenPayload } from '@fastgpt/global/core/ai/sandbox/proxyToken';

const getSecret = (): string => {
  if (!env.SANDBOX_PROXY_SECRET) {
    throw new Error('SANDBOX_PROXY_SECRET is not configured');
  }
  return env.SANDBOX_PROXY_SECRET;
};

export const signSandboxProxyToken = (
  payload: ProxyTokenPayload
): { token: string; exp: number; ttl: number } => {
  const ttl = env.SANDBOX_PROXY_TOKEN_TTL;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const token = jwt.sign(payload, getSecret(), { expiresIn: ttl });
  return { token, exp, ttl };
};
