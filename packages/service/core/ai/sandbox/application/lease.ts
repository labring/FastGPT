/**
 * Sandbox 生命周期锁分层。
 *
 * 统一锁顺序为 Source Mutation Lease -> Sandbox Lifecycle Lease；调用方不得反向嵌套。
 */
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { withRedisLease, type RedisLeaseContext } from '../../../../common/redis/lock';

const SANDBOX_SOURCE_MUTATION_LEASE_TTL_MS = 11 * 60 * 1000;
const SANDBOX_LIFECYCLE_LEASE_TTL_MS = 11 * 60 * 1000;
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

/** 串行化同一稳定 sandboxId 在任意 provider 上的远端生命周期操作。 */
export const withSandboxLifecycleLease = <T>(params: {
  sandboxId: string;
  label: string;
  fn: LeaseTask<T>;
}) =>
  withRedisLease({
    key: `agent-sandbox:lifecycle:${params.sandboxId}`,
    label: params.label,
    ttlMs: SANDBOX_LIFECYCLE_LEASE_TTL_MS,
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
