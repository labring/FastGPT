import { addSeconds } from 'date-fns';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoFrequencyLimit } from '../frequencyLimit/schema';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.SYSTEM);

export type LoginLockoutScope = 'app-password' | 'admin-password';

export function normalizeLoginAccountKey(username: string): string {
  return username.trim().toLowerCase();
}

export function buildLoginFailureEventId(
  scope: LoginLockoutScope,
  username: string,
  ip: string
): string {
  const key = normalizeLoginAccountKey(username);
  const safeIp = ip || 'unknown';
  return `login-fail:${scope}:${key}:${safeIp}`;
}

export type LoginSecurityLog = {
  scope: LoginLockoutScope;
  result:
    | 'locked'
    | 'wrong_password'
    | 'auth_code_failed'
    | 'invalid_account'
    | 'success_precheck_failed';
  normalizedAccount: string;
  ip: string;
  failCount?: number;
  userAgent?: string;
};

export function logLoginSecurityEvent(payload: LoginSecurityLog) {
  logger.info('login_security', {
    ...payload,
    userAgent: payload.userAgent
  });
}

export async function getLoginFailureCount(eventId: string): Promise<number> {
  const doc = await MongoFrequencyLimit.findOne({
    eventId,
    expiredTime: { $gte: new Date() }
  }).lean();
  return doc?.amount ?? 0;
}

export async function assertLoginNotLockedByFailures(params: {
  eventId: string;
  maxAttempts: number;
  scope: LoginLockoutScope;
  normalizedAccount: string;
  ip: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const count = await getLoginFailureCount(params.eventId);
    if (count >= params.maxAttempts) {
      logLoginSecurityEvent({
        scope: params.scope,
        result: 'locked',
        normalizedAccount: params.normalizedAccount,
        ip: params.ip,
        failCount: count,
        userAgent: params.userAgent
      });
      throw ERROR_ENUM.tooManyRequest;
    }
  } catch (e) {
    if (e === ERROR_ENUM.tooManyRequest) {
      throw e;
    }
    logger.error('assertLoginNotLockedByFailures failed', {
      eventId: params.eventId,
      error: e
    });
    throw ERROR_ENUM.tooManyRequest;
  }
}

export async function recordLoginFailure(params: {
  eventId: string;
  windowSeconds: number;
}): Promise<number> {
  const { eventId, windowSeconds } = params;
  const expiredTime = addSeconds(new Date(), windowSeconds);
  try {
    const result = await MongoFrequencyLimit.findOneAndUpdate(
      {
        eventId,
        expiredTime: { $gte: new Date() }
      },
      {
        $inc: { amount: 1 },
        $setOnInsert: { expiredTime }
      },
      {
        upsert: true,
        new: true
      }
    ).lean();
    return result?.amount ?? 1;
  } catch (error) {
    logger.error('recordLoginFailure failed', { eventId, error });
    throw ERROR_ENUM.tooManyRequest;
  }
}

export async function clearLoginFailures(eventId: string): Promise<void> {
  try {
    await MongoFrequencyLimit.deleteMany({ eventId });
  } catch (error) {
    logger.error('clearLoginFailures failed', { eventId, error });
  }
}
