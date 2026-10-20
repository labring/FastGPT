/**
 * Sandbox 资源生命周期编排。
 *
 * 所有远端 stop/delete 都在 provider 无关的 Lifecycle Lease 内先抢占 Mongo operation。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun, batchRunSettled } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import {
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource,
  findStaleSandboxOperations,
  findSkillRelatedSandboxResources,
  type SandboxResourceDoc,
  type SandboxResourceRef
} from '../infrastructure/instance/repository';
import { getSandboxProviderConfig } from '../infrastructure/provider/config';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { deleteSessionVolume, getSessionVolumeClaimName } from '../infrastructure/volume/service';
import { type SandboxInstanceSchemaType } from '../type';
import {
  SandboxInstanceStatusEnum,
  expectedOperationByStatus,
  SANDBOX_OPERATION_ISOLATION_MS
} from '../constants';
import { withSandboxLifecycleLease } from './lease';
import { SandboxLifecycleStateError, SandboxOperationConflictError } from './lifecycle/error';
import {
  runSandboxLifecycleOperation,
  runSandboxLifecycleDeletion,
  type SandboxLifecycleDeleteDefinition,
  type SandboxLifecycleDefinition
} from './lifecycle/runner';

import { canResumeSandboxOperation } from './lifecycle/utils';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

/**
 * 删除接管旧过渡态前等待不可取消 Provider 请求的保守隔离窗口。
 * 错误也可能来自超时或租约丢失，不能据此认定远端请求已终止。
 */
const assertDeleteCanFenceCurrentOperation = (resource: SandboxResourceDoc) => {
  if (!expectedOperationByStatus[resource.status]) return;
  if (!canResumeSandboxOperation(resource)) {
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
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      await stopSandboxResourceWithinLease({ current, resource, lease });
    }
  });
}

/** 锁内停止当前记录；运行准备可以续跑 stopping，不重复取得 lifecycle lease。 */
export async function stopSandboxResourceWithinLease(params: {
  current: SandboxResourceDoc | null;
  resource: SandboxResourceRef;
  lease: import('@fastgpt/dal/redis/caches').RedisLeaseContext;
}) {
  const { current, resource, lease } = params;

  if (
    !current ||
    (current.status !== SandboxInstanceStatusEnum.running &&
      current.status !== SandboxInstanceStatusEnum.stopping)
  ) {
    return null;
  }

  if (current.status === 'stopping' && !canResumeSandboxOperation(current)) {
    throw new SandboxLifecycleStateError(current.status);
  }

  const definition: SandboxLifecycleDefinition = {
    status: SandboxInstanceStatusEnum.stopping,
    steps: [
      {
        fromPhase: 'claimed',
        toPhase: 'providerStopped',
        run: async ({ resource: claimed }) => {
          await buildSandboxResourceAdapter(claimed).stop();
        }
      }
    ],
    finish: { type: 'complete', status: SandboxInstanceStatusEnum.stopped }
  };
  return runSandboxLifecycleOperation({
    resource: {
      ...current,
      ...(resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {})
    },
    lease,
    definition,
    claim: {
      type: 'claim',
      matchLastActiveAt:
        current.status === SandboxInstanceStatusEnum.running && Boolean(resource.lastActiveAt)
    }
  }).catch((error) => {
    if (error instanceof SandboxOperationConflictError) return null;
    throw error;
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
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      if (!current) return;
      assertDeleteCanFenceCurrentOperation(current);

      const definition: SandboxLifecycleDeleteDefinition = {
        status: SandboxInstanceStatusEnum.deleting,
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'providerDeleted',
            run: async ({ resource: claimed }) => {
              await buildSandboxResourceAdapter(claimed).delete();
            }
          },
          {
            fromPhase: 'providerDeleted',
            toPhase: 'volumeDeleted',
            run: async ({ resource: claimed }) => {
              if (claimed.provider === 'opensandbox') {
                const claimName = getSessionVolumeClaimName(claimed.storage);
                if (!claimName) {
                  throw new Error(
                    `OpenSandbox ${claimed.sandboxId} has no persisted workspace claimName`
                  );
                }
                await deleteSessionVolume(claimName);
              }
            }
          },
          {
            fromPhase: 'volumeDeleted',
            toPhase: 'archiveDeleted',
            run: async ({ resource: claimed }) => {
              await getS3SandboxSource().deleteWorkspaceArchiveNow({
                sandboxId: claimed.sandboxId
              });
            }
          }
        ],
        finish: { type: 'delete' }
      };
      await runSandboxLifecycleDeletion({
        resource: current,
        lease,
        definition
      });
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

/** 删除一批 Sandbox 资源；全部任务收敛后统一记录失败资源并阻止后续清理阶段。 */
const deleteSandboxResourceBatch = async (instances: SandboxResourceRef[]) => {
  const results = await batchRunSettled(
    instances,
    (instance) => deleteSandboxResource(instance),
    10
  );
  const failures = results.flatMap((result, index) => {
    if (result.success) return [];
    return [
      {
        sandboxId: instances[index].sandboxId,
        error: getErrText(result.error, 'Unknown sandbox deletion error')
      }
    ];
  });
  if (failures.length === 0) return;

  logger.error('Failed to delete sandbox resources', {
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to delete ${failures.length} sandbox resources`);
};

/** 调用方持有 Source Mutation Lease 时，清理某个 App 的全部 v2 资源。 */
export const deleteAppSandboxes = async (appId: string) => {
  const instances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });
  await deleteSandboxResourceBatch(instances);
};

/** 调用方持有各 Skill Source Mutation Lease 时，清理 Skill Edit v2 资源。 */
export const deleteSkillEditSandboxes = async (skillIds: string[]) => {
  if (skillIds.length === 0) return;
  const instances = await findSkillRelatedSandboxResources(skillIds);
  await deleteSandboxResourceBatch(instances);
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
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_ISOLATION_MS.stop)
  });
  await stopSandboxResources(stale);
}
