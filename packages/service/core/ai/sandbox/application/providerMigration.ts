/** App Sandbox 跨 provider 生命周期迁移。 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { subMinutes } from 'date-fns';
import { isRedisLeaseError } from '../../../../common/redis/lock';
import { createAgentSandboxInitializingError } from '../error';
import {
  completeSandboxProviderMigration,
  findSandboxInstanceBySource,
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
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './lifecycle/runner';

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

        const rollbackFromPhase =
          resource.metadata?.operation?.phase === 'archiveInstalled'
            ? 'archiveInstalled'
            : 'claimed';
        const definition: SandboxLifecycleDefinition = {
          operationType: SandboxOperationTypeEnum.restore,
          status: SandboxInstanceStatusEnum.restoring,
          steps: [
            {
              fromPhase: rollbackFromPhase,
              toPhase: 'rollbackProviderDeleted',
              run: async ({ resource: claimed }) => {
                await buildSandboxResourceAdapter(claimed).delete();
                if (claimed.provider === 'opensandbox') {
                  await deleteSessionVolume(claimed.sandboxId);
                }
              }
            }
          ],
          finish: { type: 'complete', status: SandboxInstanceStatusEnum.archived }
        };
        const rolledBack = await runSandboxLifecycleOperation({
          resource,
          lease,
          definition,
          previousStatus: SandboxInstanceStatusEnum.archived
        });
        if (!rolledBack) throw new Error('Stale sandbox restore rollback was not claimed');
        return rolledBack;
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

      const definition: SandboxLifecycleDefinition = {
        operationType: SandboxOperationTypeEnum.providerMigration,
        status: SandboxInstanceStatusEnum.providerMigrating,
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'targetAdapterValidated',
            run: async ({ resource: claimed }) => {
              buildSandboxResourceAdapter({
                provider: params.provider,
                sandboxId: claimed.sandboxId
              });
            }
          }
        ],
        finish: {
          type: 'custom',
          run: ({ resource: claimed, operationId }) =>
            completeSandboxProviderMigration({
              resource: claimed,
              operationId,
              provider: params.provider
            })
        }
      };
      await runSandboxLifecycleOperation({
        resource: current,
        lease,
        definition,
        previousStatus:
          current.metadata?.operation?.previousStatus ?? SandboxInstanceStatusEnum.archived,
        fromProvider: current.metadata?.operation?.fromProvider ?? current.provider,
        targetProvider: params.provider
      });
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
