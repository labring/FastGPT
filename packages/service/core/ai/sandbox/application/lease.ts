/**
 * Sandbox 生命周期锁分层。
 *
 * Source Mutation Lease 只协调业务删除和管理员迁移；生命周期隔离由 Saga lease provider 负责。
 */
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { withRedisLease, type RedisLeaseContext } from '../../../../common/redis/lock';

const SANDBOX_SOURCE_MUTATION_LEASE_TTL_MS = 11 * 60 * 1000;
const LEGACY_MIGRATION_JOB_LEASE_TTL_MS = 3 * 60 * 1000;

type LeaseTask<T> = (context: RedisLeaseContext) => Promise<T>;

/** 串行化同一 source 的首次创建、Legacy migration 和业务删除。 */
export const withSandboxSourceMutationLease = <T>(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  label: string;
  fn: LeaseTask<T>;
}) =>
  withRedisLease({
    key: `agent-sandbox:source:${params.sourceType}:${params.sourceId}`,
    label: params.label,
    ttlMs: SANDBOX_SOURCE_MUTATION_LEASE_TTL_MS,
    fn: params.fn
  });

/** 只防止管理员重复调度全量 migration，不承担单条资源正确性。 */
export const withLegacySandboxMigrationJobLease = <T>(params: {
  label: string;
  fn: LeaseTask<T>;
}) =>
  withRedisLease({
    key: 'agent-sandbox:legacy-migration-job',
    label: params.label,
    ttlMs: LEGACY_MIGRATION_JOB_LEASE_TTL_MS,
    fn: params.fn
  });
