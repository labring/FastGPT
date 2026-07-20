/**
 * Sandbox 资源生命周期编排。
 *
 * 所有远端 stop/delete 都由 Durable Saga 抢占 Mongo aggregate 并持久化 checkpoint。
 */
import { batchRun } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  findInactiveRunningSandboxResources,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource,
  findSkillRelatedSandboxResources,
  type SandboxResourceDoc,
  type SandboxResourceRef
} from '../infrastructure/instance/repository';
import { getSandboxProviderConfig } from '../infrastructure/provider/config';
import { SandboxInstanceStatusEnum, type SandboxInstanceSchemaType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

/** 停止一条已发布的 running 资源；过渡态只恢复已绑定的 Saga。 */
export async function stopSandboxResource(resource: SandboxResourceRef): Promise<void> {
  const route =
    resource.metadata === undefined
      ? await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId })
      : (resource as SandboxResourceDoc);
  if (!route) return;
  if (
    route.status !== SandboxInstanceStatusEnum.running &&
    route.status !== SandboxInstanceStatusEnum.stopping
  )
    return;
  const { stopSandboxResourceWithSaga } = await import('./lifecycle/service');
  await stopSandboxResourceWithSaga(route);
}

/**
 * 删除一条 v2 资源。
 *
 * 已有过渡态会先恢复其 active Saga，然后由 delete Saga 幂等清理所有远端资源。
 */
export async function deleteSandboxResource(resource: SandboxResourceRef): Promise<void> {
  const routed =
    resource.metadata === undefined
      ? await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId })
      : (resource as SandboxResourceDoc);
  if (!routed) return;
  const { deleteSandboxResourceWithSaga } = await import('./lifecycle/service');
  await deleteSandboxResourceWithSaga(routed);
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

/**
 * Source 删除获取独占 Source Lease 前先收敛已有 Saga，避免在持锁后递归获取 Legacy Saga 的 source lease。
 */
export const settleActiveSandboxSagasBySource = async (params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}) => {
  const instances = await findSandboxResourcesBySource(params);
  const active = instances.filter((instance) => Boolean(instance.metadata?.activeSaga));
  await batchRun(active, (instance) => deleteSandboxResource(instance), 10, {
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

export { findInactiveRunningSandboxResources };
