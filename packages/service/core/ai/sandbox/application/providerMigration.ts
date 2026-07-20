/** App Sandbox 跨 provider 生命周期迁移。 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { subMinutes } from 'date-fns';
import { isRedisLeaseError } from '../../../../common/redis/lock';
import { createAgentSandboxInitializingError } from '../error';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  completeSandboxProviderMigration,
  findSandboxInstanceBySource,
  markSandboxOperationFailed,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxProviderType
} from '../type';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { deleteSessionVolume } from '../infrastructure/volume/service';
import {
  archiveSandboxResourceForProviderMigration,
  SANDBOX_STALE_ARCHIVING_MINUTES,
  SandboxLifecycleStateError
} from './archive';
import { withSandboxLifecycleLease } from './lease';
import { assertSandboxSourceActive } from './sourceGuard';

const findSourceSandboxInstance = (params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) =>
  findSandboxInstanceBySource({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId
  });

/**
 * 把旧 provider 记录归档后原子切换到目标 provider。
 *
 * 同一稳定 sandboxId 的 archive 和 provider CAS 共用 Lifecycle Lease，避免删除/恢复穿插。
 */
export async function migrateSandboxProviderBeforeUse(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) {
  await assertSandboxSourceActive({
    sourceType: params.sourceType,
    sourceId: params.sourceId
  });
  const existing = await findSourceSandboxInstance(params);
  if (!existing || existing.provider === params.provider) return;

  return withSandboxLifecycleLease({
    sandboxId: params.sandboxId,
    label: `migrate-sandbox-provider:${params.sandboxId}`,
    fn: async (lease) => {
      let current = await findSourceSandboxInstance(params);
      if (!current || current.provider === params.provider) return;
      if (current.sandboxId !== params.sandboxId) {
        throw new Error(
          `Sandbox provider migration sandboxId mismatch: expected ${params.sandboxId}, received ${current.sandboxId}`
        );
      }

      /** 清理崩溃 restore 留下的旧 provider 半成品，但保留 S3 归档作为迁移事实。 */
      const rollbackStaleRestore = async (
        resource: SandboxResourceDoc
      ): Promise<SandboxResourceDoc> => {
        if (resource.status !== SandboxInstanceStatusEnum.restoring) return resource;
        const operation = resource.metadata?.operation;
        const staleBefore = subMinutes(new Date(), SANDBOX_STALE_ARCHIVING_MINUTES);
        if (!operation?.error && operation?.heartbeatAt && operation.heartbeatAt >= staleBefore) {
          throw new SandboxLifecycleStateError(resource.status);
        }

        const claimed = await claimSandboxOperation({
          resource,
          status: SandboxInstanceStatusEnum.restoring,
          type: SandboxOperationTypeEnum.restore,
          previousStatus: SandboxInstanceStatusEnum.archived
        });
        if (!claimed?.metadata?.operation?.id) {
          throw new Error('Stale sandbox restore rollback was not claimed');
        }
        const operationId = claimed.metadata.operation.id;
        let phase = claimed.metadata.operation.phase;
        try {
          if (phase === 'claimed' || phase === 'archiveInstalled') {
            lease.assertValid();
            await buildSandboxResourceAdapter(claimed).delete();
            if (claimed.provider === 'opensandbox') {
              await deleteSessionVolume(claimed.sandboxId);
            }
            lease.assertValid();
            const deleted = await advanceSandboxOperation({
              resource: claimed,
              operationId,
              status: SandboxInstanceStatusEnum.restoring,
              phase: 'rollbackProviderDeleted'
            });
            if (!deleted) {
              throw new Error('Stale sandbox restore rollback lost ownership after delete');
            }
            phase = 'rollbackProviderDeleted';
          }
          if (phase !== 'rollbackProviderDeleted') {
            throw new Error(`Unsupported stale sandbox restore rollback phase: ${phase}`);
          }
          const rolledBack = await completeSandboxOperation({
            resource: claimed,
            operationId,
            fromStatus: SandboxInstanceStatusEnum.restoring,
            status: SandboxInstanceStatusEnum.archived
          });
          if (!rolledBack) throw new Error('Stale sandbox restore rollback lost ownership');
          return rolledBack;
        } catch (error) {
          await markSandboxOperationFailed({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.restoring,
            error: getErrText(error)
          }).catch(() => undefined);
          throw error;
        }
      };

      current = await rollbackStaleRestore(current);

      if (
        current.status === SandboxInstanceStatusEnum.providerMigrating &&
        current.metadata?.operation?.targetProvider !== params.provider
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }

      if (
        current.status !== SandboxInstanceStatusEnum.archived &&
        current.status !== SandboxInstanceStatusEnum.providerMigrating
      ) {
        const archived = await archiveSandboxResourceForProviderMigration(current, lease);
        if (archived.status === 'failed') {
          throw new Error(`Failed to archive sandbox before provider migration: ${archived.error}`);
        }
        current = await findSourceSandboxInstance(params);
      }
      if (!current || current.provider === params.provider) return;
      if (
        current.status !== SandboxInstanceStatusEnum.archived &&
        current.status !== SandboxInstanceStatusEnum.providerMigrating
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }

      const claimed = await claimSandboxOperation({
        resource: current,
        status: SandboxInstanceStatusEnum.providerMigrating,
        type: SandboxOperationTypeEnum.providerMigration,
        previousStatus:
          current.metadata?.operation?.previousStatus ?? SandboxInstanceStatusEnum.archived,
        fromProvider: current.metadata?.operation?.fromProvider ?? current.provider,
        targetProvider: params.provider
      });
      if (!claimed?.metadata?.operation?.id) {
        throw new Error('Sandbox provider migration operation was not claimed');
      }
      const operationId = claimed.metadata.operation.id;
      let phase = claimed.metadata.operation.phase;

      try {
        if (phase === 'claimed') {
          lease.assertValid();
          buildSandboxResourceAdapter({
            provider: params.provider,
            sandboxId: claimed.sandboxId
          });
          const validated = await advanceSandboxOperation({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.providerMigrating,
            phase: 'targetAdapterValidated'
          });
          if (!validated) {
            throw new Error('Sandbox provider migration lost ownership after target validation');
          }
          phase = 'targetAdapterValidated';
        }
        if (phase !== 'targetAdapterValidated') {
          throw new Error(`Unsupported sandbox provider migration phase: ${phase}`);
        }
        const completed = await completeSandboxProviderMigration({
          resource: claimed,
          operationId,
          provider: params.provider
        });
        if (!completed) {
          throw new Error('Sandbox provider migration lost ownership before commit');
        }
      } catch (error) {
        await markSandboxOperationFailed({
          resource: claimed,
          operationId,
          status: SandboxInstanceStatusEnum.providerMigrating,
          error: getErrText(error)
        }).catch(() => undefined);
        throw error;
      }
    }
  }).catch((error) => {
    if (isRedisLeaseError(error)) throw createAgentSandboxInitializingError();
    throw error;
  });
}

export const migrateAppSandboxProviderBeforeUse = (params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceId: string;
  userId: string;
}) =>
  migrateSandboxProviderBeforeUse({
    ...params,
    sourceType: ChatSourceTypeEnum.app
  });
