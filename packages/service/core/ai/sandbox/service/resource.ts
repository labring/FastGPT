import { batchRun } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  deleteSandboxResourceRecord,
  findSandboxResourcesBySource,
  findSandboxResourcesBySourceChatIds,
  findSkillRelatedSandboxResources,
  markSandboxResourceStopped,
  type SandboxResourceRef
} from '../instance/repository';
import { buildSandboxResourceAdapter } from '../provider/adapter';
import { deleteSessionVolume } from '../volume/service';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

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
  opts: { keepVolume?: boolean } = {}
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
  await getS3SandboxSource()
    .deleteWorkspaceArchive({
      sandboxId: resource.sandboxId
    })
    .catch((err) => {
      logger.error('Failed to delete sandbox archive', {
        sandboxId: resource.sandboxId,
        error: err
      });
    });
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
