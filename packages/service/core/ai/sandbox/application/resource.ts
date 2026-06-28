/**
 * 沙盒业务层：编排 sandbox 资源停止、删除和业务归属清理。
 *
 * 负责调用 provider 删除/停止、同步 Mongo 状态并清理 volume/archive 对象。
 */
import { batchRun } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  deleteSandboxResourceRecord,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource,
  findSandboxResourcesBySourceChatIds,
  findSkillRelatedSandboxResources,
  markSandboxResourceStopped,
  type SandboxResourceRef
} from '../infrastructure/instance/repository';
import { getSandboxProviderConfig } from '../infrastructure/provider/config';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { deleteSessionVolume } from '../infrastructure/volume/service';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import type { SandboxInstanceSchemaType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

const deleteSandboxResources = async (instances: SandboxResourceRef[]) => {
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      await deleteSandboxResource(doc).catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
        return Promise.reject(err);
      });
    })
  );
};

/**
 * 停止一条已存在的 sandbox 资源记录。
 *
 * 这里按资源自己的 provider/sandboxId 操作，不触发运行态 ensure/create/resume，
 * 用于 cron、批量删除前清理、provider 切换后的历史资源处理。
 */
export async function stopSandboxResource(resource: SandboxResourceRef): Promise<void> {
  const sandbox = buildSandboxResourceAdapter(resource);

  await sandbox.stop();
  const stoppedResult = await markSandboxResourceStopped(resource);
  if (resource.lastActiveAt && stoppedResult?.matchedCount === 0) {
    logger.warn('Skip marking sandbox stopped because record changed after stop', {
      sandboxId: resource.sandboxId,
      provider: resource.provider
    });
  }
}

/**
 * 删除一条已存在的 sandbox 资源记录，并尽力清理关联 volume。
 */
export async function deleteSandboxResource(
  resource: SandboxResourceRef,
  opts: { keepVolume?: boolean; keepArchive?: boolean } = {}
): Promise<void> {
  const sandbox = buildSandboxResourceAdapter(resource);

  await sandbox.delete();
  if (!opts.keepVolume && resource.provider === 'opensandbox') {
    await deleteSessionVolume(resource.sandboxId).catch((err) => {
      logger.error('Failed to delete sandbox volume', {
        sandboxId: resource.sandboxId,
        error: err
      });
    });
  }
  await deleteSandboxResourceRecord(resource);
  if (!opts.keepArchive) {
    await getS3SandboxSource()
      .deleteWorkspaceArchive({
        sandboxId: resource.sandboxId
      })
      .catch((err: unknown) => {
        logger.error('Failed to delete sandbox archive', {
          sandboxId: resource.sandboxId,
          error: err
        });
      });
  }
}

/**
 * 查询当前 provider 下指定团队可访问的 sandbox 信息。
 *
 * 只读取本地实例表，不触发 provider 创建、恢复或归档流程。
 */
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const { sandboxId, teamId } = params;
  const providerConfig = getSandboxProviderConfig();
  const sandbox = await findSandboxInstanceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  return sandbox.toObject<SandboxInstanceSchemaType>();
}

/**
 * 删除当前 provider 下指定团队可访问的 sandbox。
 *
 * 删除动作会同时清理远端资源、本地实例记录和归档对象。
 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const { sandboxId, teamId } = params;
  const providerConfig = getSandboxProviderConfig();
  const instanceDoc = await findSandboxResourceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!instanceDoc) {
    throw new Error('Sandbox not found or access denied');
  }

  logger.info('[Sandbox] Deleting sandbox', { sandboxId });

  await deleteSandboxResource(instanceDoc);
}

/**
 * 删除某个 App 下指定 chat 会话绑定的 runtime sandbox。
 *
 * 只服务 App chat 删除、批量历史清理和 Pro 过期 chat 清理；Skill Edit 编辑沙盒不跟 chat
 * 生命周期绑定，必须通过 deleteSkillEditSandboxes 处理。
 */
export const deleteAppChatRuntimeSandboxes = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}) => {
  if (chatIds.length === 0) return;

  const instances = await findSandboxResourcesBySourceChatIds({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId,
    chatIds
  });
  await deleteSandboxResources(instances);
};

/**
 * 删除某个 App 下的全部 sandbox 资源。
 *
 * 这是 App 删除场景的语义化入口；内部仍走 source-aware 查询，避免上层继续拼物理字段。
 */
export const deleteAppSandboxes = async (appId: string) => {
  const instances = await findSandboxResourcesBySource({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });
  await deleteSandboxResources(instances);
};

/**
 * 删除一批 Skill Edit 相关的全部 sandbox 资源。
 *
 * 只在 Skill 删除时调用。Skill Edit 对话删除、过期聊天清理不应调用这里。
 */
export const deleteSkillEditSandboxes = async (skillIds: string[]) => {
  if (skillIds.length === 0) return;

  const instances = await findSkillRelatedSandboxResources(skillIds);
  logger.info('Deleting skill edit sandboxes', {
    skillIds,
    count: instances.length
  });
  await deleteSandboxResources(instances);
};

/**
 * 批量暂停已存在的 sandbox 资源。
 *
 * 主要供 cron 使用；失败只记录日志，不让单个 provider 异常阻断同批其它资源的暂停。
 */
export async function stopSandboxResources(resources: SandboxResourceRef[]): Promise<void> {
  await batchRun(resources, async (resource) => {
    await stopSandboxResource(resource).catch((err) => {
      logger.error('Failed to stop sandbox', { sandboxId: resource.sandboxId, error: err });
    });
  });
}
