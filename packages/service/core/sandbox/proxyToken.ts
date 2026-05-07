import jwt from 'jsonwebtoken';
import { serviceEnv } from '../../env';
import type { ProxyTokenPayload } from '@fastgpt/global/core/ai/sandbox/proxyToken';

export const signSandboxProxyToken = (
  payload: ProxyTokenPayload
): { token: string; exp: number; ttl: number } => {
  const ttl = serviceEnv.SANDBOX_PROXY_TOKEN_TTL;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const token = jwt.sign(payload, serviceEnv.SANDBOX_PROXY_SECRET!, { expiresIn: ttl });
  return { token, exp, ttl };
};
