/**
 * Sandbox 资源生命周期编排。
 *
 * 所有远端 stop/delete 都在 provider 无关的 Lifecycle Lease 内先抢占 Mongo operation。
 */
import { batchRun } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { subMinutes } from 'date-fns';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  deleteClaimedSandboxRecord,
  findInactiveRunningSandboxResources,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource,
  findStaleSandboxOperations,
  findSkillRelatedSandboxResources,
  markSandboxOperationFailed,
  type SandboxResourceDoc,
  type SandboxResourceRef
} from '../infrastructure/instance/repository';
import { getSandboxProviderConfig } from '../infrastructure/provider/config';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { deleteSessionVolume } from '../infrastructure/volume/service';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxInstanceStatusType,
  type SandboxInstanceSchemaType
} from '../type';
import { withSandboxLifecycleLease } from './lease';
import { SANDBOX_STALE_ARCHIVING_MINUTES, SandboxLifecycleStateError } from './archive';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
export const SANDBOX_STALE_STOPPING_MINUTES = 15;

const deleteIsolationMinutesByStatus: Partial<Record<SandboxInstanceStatusType, number>> = {
  provisioning: SANDBOX_STALE_STOPPING_MINUTES,
  legacyMigrating: SANDBOX_STALE_ARCHIVING_MINUTES,
  stopping: SANDBOX_STALE_STOPPING_MINUTES,
  archiving: SANDBOX_STALE_ARCHIVING_MINUTES,
  restoring: SANDBOX_STALE_ARCHIVING_MINUTES,
  providerMigrating: SANDBOX_STALE_ARCHIVING_MINUTES
};

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

const requireOperationId = (resource: SandboxResourceDoc) => {
  const operationId = resource.metadata?.operation?.id;
  if (!operationId) throw new Error(`Sandbox ${resource.sandboxId} has no lifecycle operation`);
  return operationId;
};

/**
 * 删除接管旧过渡态前等待不可取消 Provider 请求的保守隔离窗口。
 * 明确失败的 operation 已确认调用结束，可以立即由删除流程 fencing。
 */
const assertDeleteCanFenceCurrentOperation = (resource: SandboxResourceDoc) => {
  if (resource.status === SandboxInstanceStatusEnum.deleting) return;
  const isolationMinutes = deleteIsolationMinutesByStatus[resource.status];
  if (!isolationMinutes) return;

  const operation = resource.metadata?.operation;
  if (operation?.error) return;
  const staleBefore = subMinutes(new Date(), isolationMinutes);
  if (!operation?.heartbeatAt || operation.heartbeatAt >= staleBefore) {
    throw new SandboxLifecycleStateError(
      resource.status,
      `Sandbox ${resource.sandboxId} is still inside the ${resource.status} delete isolation window`
    );
  }
};

/** 停止一条已发布的 running 资源；状态抢占失败时不会触发远端 stop。 */
export async function stopSandboxResource(resource: SandboxResourceRef): Promise<void> {
  await withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `stop-sandbox:${resource.sandboxId}`,
    fn: async ({ assertValid }) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      if (
        !current ||
        (current.status !== SandboxInstanceStatusEnum.running &&
          current.status !== SandboxInstanceStatusEnum.stopping)
      ) {
        return;
      }

      const claimed = await claimSandboxOperation({
        resource: {
          ...current,
          ...(resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {})
        },
        status: SandboxInstanceStatusEnum.stopping,
        type: SandboxOperationTypeEnum.stop,
        matchLastActiveAt:
          current.status === SandboxInstanceStatusEnum.running && Boolean(resource.lastActiveAt)
      });
      if (!claimed) return;
      const operationId = requireOperationId(claimed);
      let phase = claimed.metadata?.operation?.phase ?? 'claimed';

      try {
        if (phase === 'claimed') {
          assertValid();
          await buildSandboxResourceAdapter(claimed).stop();
          assertValid();
          const stopped = await advanceSandboxOperation({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.stopping,
            phase: 'providerStopped'
          });
          if (!stopped)
            throw new Error('Sandbox stop operation lost ownership after provider stop');
          phase = 'providerStopped';
        }
        if (phase !== 'providerStopped') {
          throw new Error(`Unsupported sandbox stop phase: ${phase}`);
        }
        const completed = await completeSandboxOperation({
          resource: claimed,
          operationId,
          fromStatus: SandboxInstanceStatusEnum.stopping,
          status: SandboxInstanceStatusEnum.stopped
        });
        if (!completed) throw new Error('Sandbox stop operation lost ownership before commit');
      } catch (error) {
        await markSandboxOperationFailed({
          resource: claimed,
          operationId,
          status: SandboxInstanceStatusEnum.stopping,
          error: getErrText(error)
        }).catch(() => undefined);
        throw error;
      }
    }
  });
}

/**
 * 删除一条 v2 资源。
 *
 * 重试会重新 fencing 旧 deleting operation，并幂等重放各远端删除步骤。
 */
export async function deleteSandboxResource(resource: SandboxResourceRef): Promise<void> {
  await withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `delete-sandbox:${resource.sandboxId}`,
    fn: async ({ assertValid }) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      if (!current) return;
      assertDeleteCanFenceCurrentOperation(current);

      const claimed = await claimSandboxOperation({
        resource: current,
        status: SandboxInstanceStatusEnum.deleting,
        type: SandboxOperationTypeEnum.delete
      });
      if (!claimed) throw new Error('Sandbox delete operation failed to claim current record');
      const operationId = requireOperationId(claimed);
      let phase = claimed.metadata?.operation?.phase ?? 'claimed';

      try {
        if (phase === 'claimed') {
          assertValid();
          await buildSandboxResourceAdapter(claimed).delete();
          assertValid();
          const providerDeleted = await advanceSandboxOperation({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.deleting,
            phase: 'providerDeleted'
          });
          if (!providerDeleted) {
            throw new Error('Sandbox delete operation lost ownership after provider delete');
          }
          phase = 'providerDeleted';
        }

        if (phase === 'providerDeleted') {
          if (claimed.provider === 'opensandbox') {
            assertValid();
            await deleteSessionVolume(claimed.sandboxId);
          }
          assertValid();
          const volumeDeleted = await advanceSandboxOperation({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.deleting,
            phase: 'volumeDeleted'
          });
          if (!volumeDeleted) {
            throw new Error('Sandbox delete operation lost ownership after volume delete');
          }
          phase = 'volumeDeleted';
        }

        if (phase === 'volumeDeleted') {
          assertValid();
          await getS3SandboxSource().deleteWorkspaceArchive({ sandboxId: claimed.sandboxId });
          assertValid();
          const archiveDeleted = await advanceSandboxOperation({
            resource: claimed,
            operationId,
            status: SandboxInstanceStatusEnum.deleting,
            phase: 'archiveDeleted'
          });
          if (!archiveDeleted) {
            throw new Error('Sandbox delete operation lost ownership after archive delete');
          }
          phase = 'archiveDeleted';
        }
        if (phase !== 'archiveDeleted') {
          throw new Error(`Unsupported sandbox delete phase: ${phase}`);
        }

        const result = await deleteClaimedSandboxRecord({ resource: claimed, operationId });
        if (result.deletedCount !== 1) {
          throw new Error('Sandbox delete operation lost ownership before record cleanup');
        }
      } catch (error) {
        await markSandboxOperationFailed({
          resource: claimed,
          operationId,
          status: SandboxInstanceStatusEnum.deleting,
          error: getErrText(error)
        }).catch(() => undefined);
        throw error;
      }
    }
  });
}

/** 查询当前 provider 下指定团队可访问的 sandbox 信息。 */
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const providerConfig = getSandboxProviderConfig();
  const sandbox = await findSandboxInstanceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId: params.sandboxId,
    teamId: params.teamId
  });
  if (!sandbox) throw new Error('Sandbox not found or access denied');
  return sandbox.toObject<SandboxInstanceSchemaType>();
}

/** 删除当前 provider 下指定团队可访问的 sandbox。 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const providerConfig = getSandboxProviderConfig();
  const instance = await findSandboxResourceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId: params.sandboxId,
    teamId: params.teamId
  });
  if (!instance) throw new Error('Sandbox not found or access denied');
  await deleteSandboxResource(instance);
}

/** 调用方持有 Source Mutation Lease 时，清理某个 App 的全部 v2 资源。 */
export const deleteAppSandboxes = async (appId: string) => {
  const instances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });
  await batchRun(instances, (instance) => deleteSandboxResource(instance), 10, {
    waitForAll: true
  });
};

/** 调用方持有各 Skill Source Mutation Lease 时，清理 Skill Edit v2 资源。 */
export const deleteSkillEditSandboxes = async (skillIds: string[]) => {
  if (skillIds.length === 0) return;
  const instances = await findSkillRelatedSandboxResources(skillIds);
  await batchRun(instances, (instance) => deleteSandboxResource(instance), 10, {
    waitForAll: true
  });
};

/** cron 批量 stop；单条失败会记录并允许同批其他资源继续。 */
export async function stopSandboxResources(resources: SandboxResourceRef[]): Promise<void> {
  await batchRun(resources, async (resource) => {
    await stopSandboxResource(resource).catch((error) => {
      logger.error('Failed to stop sandbox', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  });
}

/** 重新 fencing 超过隔离窗口的 stopping operation，并幂等重放 provider stop。 */
export async function retryStaleStoppingSandboxes(now = new Date()): Promise<void> {
  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.stopping],
    heartbeatBefore: subMinutes(now, SANDBOX_STALE_STOPPING_MINUTES)
  });
  await stopSandboxResources(stale);
}

export { findInactiveRunningSandboxResources };
