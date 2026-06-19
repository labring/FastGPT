import {
  EnterpriseAuditActorTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';
import type {
  EnterpriseAuditActor,
  EnterpriseAuditLogSchemaType,
  EnterpriseAuditResource
} from '@fastgpt/global/support/enterprise/audit/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';
import { MongoEnterpriseAuditLog } from './schema';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);
const sensitiveKeyPattern =
  /password|psw|token|secret|authorization|cookie|apikey|apiKey|key$/i;

type WriteEnterpriseAuditEventProps = {
  action: EnterpriseAuditLogSchemaType['action'];
  result: `${EnterpriseAuditResultEnum}`;
  actor?: EnterpriseAuditActor;
  resource?: EnterpriseAuditResource;
  requestId?: string;
  clientIp?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

/**
 * 写入企业审计事件。审计写入失败不会中断主流程，但会记录错误日志，避免审计系统短暂异常造成业务不可用。
 */
export function writeEnterpriseAuditEvent({
  action,
  result,
  actor = { type: EnterpriseAuditActorTypeEnum.System },
  resource,
  requestId,
  clientIp,
  userAgent,
  metadata = {}
}: WriteEnterpriseAuditEventProps): void {
  if (!serviceEnv.ENTERPRISE_AUDIT_LOG_ENABLED) return;

  retryFn(async () => {
    await MongoEnterpriseAuditLog.create({
      action,
      result,
      actor: sanitizeObject(actor),
      resource: resource ? sanitizeObject(resource) : undefined,
      requestId,
      clientIp,
      userAgent,
      metadata: sanitizeObject(metadata)
    });
  }).catch((error) => {
    logger.error('Failed to write enterprise audit event', { action, result, error });
  });
}

export function createUserAuditActor({
  userId,
  teamId,
  tmbId,
  isRoot,
  name
}: {
  userId?: string;
  teamId?: string;
  tmbId?: string;
  isRoot?: boolean;
  name?: string;
}): EnterpriseAuditActor {
  return {
    type: isRoot ? EnterpriseAuditActorTypeEnum.Root : EnterpriseAuditActorTypeEnum.User,
    userId,
    teamId,
    tmbId,
    name
  };
}

export function createAnonymousAuditActor(name?: string): EnterpriseAuditActor {
  return {
    type: EnterpriseAuditActorTypeEnum.Anonymous,
    name
  };
}

export function sanitizeEnterpriseAuditMetadata<T>(value: T): T {
  return sanitizeObject(value);
}

function sanitizeObject<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item)) as T;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitizeObject(item)
    ])
  ) as T;
}
