import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  deleteSandboxResourceRecord,
  findSandboxResourcesByAppId,
  findSandboxResourcesByChatIds,
  markSandboxResourceStopped,
  type SandboxResourceRef
} from '../instance/repository';
import { buildSandboxResourceAdapter } from '../provider/adapter';
import { deleteSessionVolume } from '../volume/service';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 停止一条已存在的 sandbox 资源记录。
 *
 * 这里按资源自己的 provider/sandboxId 操作，不触发运行态 ensure/create/resume，
 * 用于 cron、批量删除前清理、provider 切换后的历史资源处理。
 */
export async function stopSandboxResource(resource: SandboxResourceRef): Promise<void> {
  const sandbox = buildSandboxResourceAdapter(resource);

  await sandbox.stop();
  await markSandboxResourceStopped(resource);
}

/**
 * 删除一条已存在的 sandbox 资源记录，并尽力清理关联 volume。
 */
export async function deleteSandboxResource(resource: SandboxResourceRef): Promise<void> {
  const sandbox = buildSandboxResourceAdapter(resource);

  await sandbox.delete();
  await deleteSessionVolume(resource.sandboxId).catch((err) => {
    logger.error('Failed to delete sandbox volume', {
      sandboxId: resource.sandboxId,
      error: err
    });
  });
  await deleteSandboxResourceRecord(resource);
}

/**
 * 删除某个 app 下指定 chat 会话关联的 sandbox 资源。
 *
 * 这里用于聊天记录删除等批量清理场景；单个资源清理失败会记录日志并继续处理剩余资源。
 */
export const deleteSandboxesByChatIds = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}) => {
  const instances = await findSandboxResourcesByChatIds({ appId, chatIds });
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
 * 删除某个 app 下的全部 sandbox 资源。
 *
 * app 删除流程可能遇到多个 chat、edit-debug 或历史 provider 资源，因此统一从实例记录查询后逐条清理。
 */
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await findSandboxResourcesByAppId(appId);
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      await deleteSandboxResource(doc).catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    })
  );
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
