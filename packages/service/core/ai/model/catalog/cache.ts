import { delay, withTimeout } from '@fastgpt/global/common/system/utils';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { SimpleLRUCache } from '../../../../common/cache/simpleLru';
import { getLogger, LogCategories } from '../../../../common/logger';
import { formatDbModelToRuntimeModel } from '../runtime';
import { readModelCatalogRevision, readModelCatalogSnapshot } from './entity';
import { createModelHandle, type ModelHandle } from './handle';

const teamHandles = new SimpleLRUCache<
  string,
  { handle: ModelHandle; teamRevision: number; systemVersion: string; systemRevision: number }
>();
const teamLoads = new Map<string, Promise<ModelHandle>>();

/** 清理本进程的团队快照；跨实例一致性始终由数据库修订号保证。 */
export const invalidateTeamModelCatalog = (teamId: string) => teamHandles.delete(teamId);

/** 清理全部团队快照，仅用于独立运行环境或测试重置。 */
export const clearTeamModelCatalogCache = () => teamHandles.clear();

/**
 * 聚合系统快照与一个团队的模型。每次读取先检查该团队的数据库版本，
 * 模型列表和版本在同一 Mongo 快照读取；不依赖进程内版本通知，也不扫描其他团队。
 * 具备自旋超时与降级保护，避免从库延迟导致紧密轮询或请求阻塞。
 */
export const getScopedTeamModelHandle = async ({
  teamId,
  systemHandle
}: {
  teamId: string;
  systemHandle: ModelHandle;
}): Promise<ModelHandle> => {
  const existingLoad = teamLoads.get(teamId);
  if (existingLoad) {
    await existingLoad;
    // 并发请求可能持有不同系统快照，复用后仍需核对当前调用的两个版本。
  }

  const load = async () => {
    const context = { scope: ModelScopeEnum.team, teamId } as const;
    const requiredRevision = await readModelCatalogRevision(context);
    const cached = teamHandles.get(teamId);
    if (
      cached &&
      cached.teamRevision >= requiredRevision &&
      cached.systemVersion === systemHandle.version &&
      cached.systemRevision === systemHandle.revision
    ) {
      return cached.handle;
    }

    const readSnapshot = async () => {
      let snapshot = await readModelCatalogSnapshot(context);
      let attempts = 0;
      while (snapshot.revision < requiredRevision) {
        attempts++;
        if (attempts >= 10) {
          getLogger(LogCategories.MODULE.AI.MODEL).warn(
            'Team model catalog snapshot revision lag exceeded max attempts',
            {
              teamId,
              currentRevision: snapshot.revision,
              requiredRevision,
              attempts
            }
          );
          break;
        }
        await delay(50);
        snapshot = await readModelCatalogSnapshot(context);
      }
      return snapshot;
    };
    const { models, revision } = await readSnapshot();
    const teamModels = models.map((model) =>
      formatDbModelToRuntimeModel(model, { fallbackProvider: true })
    );
    const handle = createModelHandle({
      models: [...systemHandle.getSystemModels(), ...teamModels],
      defaultModels: systemHandle.defaultModels,
      configuredDefaultModelIds: systemHandle.configuredDefaultModelIds,
      revision: systemHandle.revision,
      version: `${systemHandle.version}:team:${teamId}:${revision}`
    });
    teamHandles.set(teamId, {
      handle,
      teamRevision: revision,
      systemVersion: systemHandle.version,
      systemRevision: systemHandle.revision
    });
    return handle;
  };

  const loadWithTimeout = async () => {
    try {
      return await withTimeout(load(), 5000, 'Team model catalog refresh timed out');
    } catch (error) {
      const cached = teamHandles.get(teamId);
      if (cached) {
        getLogger(LogCategories.MODULE.AI.MODEL).warn(
          'Using local team model catalog after refresh failure',
          {
            error,
            teamId,
            revision: cached.teamRevision
          }
        );
        return cached.handle;
      }
      throw error;
    }
  };

  const request = loadWithTimeout().finally(() => {
    if (teamLoads.get(teamId) === request) teamLoads.delete(teamId);
  });
  teamLoads.set(teamId, request);
  return request;
};

let systemHandle: ModelHandle | undefined;

/** 目录加载器内部读取已发布快照；业务入口必须先执行数据库修订号检查。 */
export const getCachedSystemModelHandle = () => systemHandle;

/** 原子发布完整系统快照，已发出的不可变 handle 不会被后续发布修改。 */
export const publishSystemModelHandle = (handle: ModelHandle | undefined) => {
  systemHandle = handle;
};
