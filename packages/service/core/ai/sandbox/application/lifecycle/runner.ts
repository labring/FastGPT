/** 持久化生命周期执行器：统一 claim、checkpoint、失败记录和终态 CAS，不决定业务方向。 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  deleteClaimedSandboxRecord,
  markSandboxOperationFailed,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { type SandboxInstanceStatusType, type SandboxStableStatusType } from '../../type';
import { expectedOperationByStatus, SANDBOX_OPERATION_ISOLATION_MS } from '../../constants';
import { SandboxOperationSettledError, SandboxOperationConflictError } from './error';

type SandboxLifecycleStepContext = {
  resource: SandboxResourceDoc;
  operationId: string;
  lease: RedisLeaseContext;
  assertValid: () => void;
};
type SandboxCheckpoint = Partial<Pick<SandboxResourceDoc, 'storage' | 'image' | 'versionId'>> & {
  limit?: Partial<NonNullable<SandboxResourceDoc['limit']>>;
};

export type SandboxLifecycleStep = {
  fromPhase: string;
  toPhase: string;
  /** 返回值与阶段原子提交；后续 step 从 context.resource 读取持久化结果。 */
  run: (context: SandboxLifecycleStepContext) => Promise<void | SandboxCheckpoint>;
};

type SandboxLifecycleSteps = {
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  steps: readonly SandboxLifecycleStep[];
};
export type SandboxLifecycleDefinition = SandboxLifecycleSteps & {
  finish: {
    type: 'complete';
    status: SandboxStableStatusType;
    touchActive?: boolean;
    beforeComplete?: (context: SandboxLifecycleStepContext) => Promise<void>;
    set?: SandboxCheckpoint | ((context: SandboxLifecycleStepContext) => SandboxCheckpoint);
  };
};
export type SandboxLifecycleDeleteDefinition = SandboxLifecycleSteps & {
  finish: { type: 'delete' };
};

type LifecycleClaim =
  | { type: 'created' }
  | {
      type: 'claim';
      initialPhase?: string;
      set?: SandboxCheckpoint;
      previousStatus?: SandboxStableStatusType;
      matchLastActiveAt?: boolean;
    };
export type RunSandboxLifecycleParams = {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  definition: SandboxLifecycleDefinition;
  claim?: LifecycleClaim;
  onClaim?: (resource: SandboxResourceDoc) => void;
};

/** 执行机制共用，完成与删除各自返回明确结果；接管资格由上层统一策略决定。 */
async function executeSandboxLifecycle<T>(
  params: Omit<RunSandboxLifecycleParams, 'definition'> & { definition: SandboxLifecycleSteps },
  finish: (context: SandboxLifecycleStepContext) => Promise<T>
): Promise<T> {
  const { resource, lease, definition } = params;
  const operationType = expectedOperationByStatus[definition.status];
  lease.assertValid();
  const claim = params.claim;
  const claimed =
    claim?.type === 'created'
      ? resource
      : await claimSandboxOperation({
          resource,
          status: definition.status,
          type: operationType,
          phase: claim?.initialPhase,
          set: claim?.set,
          previousStatus: claim?.previousStatus,
          matchLastActiveAt: claim?.matchLastActiveAt
        });
  if (!claimed) throw new SandboxOperationConflictError(resource.sandboxId);
  const operation = claimed.operation;
  if (!operation || claimed.status !== definition.status || operation.type !== operationType) {
    throw new Error(
      `Sandbox ${resource.sandboxId} does not own the expected ${operationType} operation`
    );
  }
  params.onClaim?.(claimed);
  const context = {
    resource: claimed,
    operationId: operation.id,
    lease,
    assertValid: () => lease.assertValid()
  };
  try {
    const phases = [
      definition.steps[0]?.fromPhase ?? operation.phase,
      ...definition.steps.map((step) => step.toPhase)
    ];
    let phaseIndex = phases.indexOf(operation.phase);
    if (phaseIndex < 0) throw new Error(`Unsupported ${operationType} phase: ${operation.phase}`);
    for (const [stepIndex, step] of definition.steps.entries()) {
      if (phaseIndex > stepIndex) continue;
      if (phaseIndex !== stepIndex || step.fromPhase !== phases[stepIndex]) {
        throw new Error(
          `Unsupported ${operationType} phase transition: ${context.resource.operation?.phase} -> ${step.toPhase}`
        );
      }
      context.assertValid();
      const set = await step.run(context);
      context.assertValid();
      const advanced = await advanceSandboxOperation({
        resource: claimed,
        operationId: operation.id,
        status: definition.status,
        phase: step.toPhase,
        set: set ?? undefined
      });
      if (!advanced)
        throw new Error(`Sandbox ${operationType} operation lost ownership after ${step.toPhase}`);
      context.resource = advanced;
      phaseIndex = stepIndex + 1;
    }
    context.assertValid();
    return await finish(context);
  } catch (error) {
    // 失去租约的旧执行者不能标记失败或补偿。未知远端结果保留隔离窗口。
    context.assertValid();
    await markSandboxOperationFailed({
      resource: claimed,
      operationId: operation.id,
      status: definition.status,
      error: getErrText(error),
      retryAfter: new Date(
        Date.now() +
          (error instanceof SandboxOperationSettledError
            ? 0
            : SANDBOX_OPERATION_ISOLATION_MS[operationType])
      )
    }).catch(() => undefined);
    throw error;
  }
}

/** 成功完成一定返回最新记录；抢占冲突和终态 CAS 失败抛错，不用 null 表示多种结果。 */
export async function runSandboxLifecycleOperation(
  params: RunSandboxLifecycleParams
): Promise<SandboxResourceDoc> {
  return executeSandboxLifecycle(params, async (context) => {
    const finish = params.definition.finish;
    await finish.beforeComplete?.(context);
    context.assertValid();
    const completed = await completeSandboxOperation({
      resource: context.resource,
      operationId: context.operationId,
      fromStatus: params.definition.status,
      status: finish.status,
      touchActive: finish.touchActive,
      set: typeof finish.set === 'function' ? finish.set(context) : finish.set
    });
    if (!completed) throw new Error(`Sandbox operation lost ownership before terminal commit`);
    return completed;
  });
}

/** 删除成功返回 void；只有 deleting token 可以移除实例记录。 */
export async function runSandboxLifecycleDeletion(
  params: Omit<RunSandboxLifecycleParams, 'definition'> & {
    definition: SandboxLifecycleDeleteDefinition;
  }
): Promise<void> {
  await executeSandboxLifecycle(params, async ({ resource, operationId }) => {
    const deleted = await deleteClaimedSandboxRecord({ resource, operationId });
    if (deleted.deletedCount !== 1)
      throw new Error('Sandbox delete operation lost ownership before record cleanup');
  });
}
