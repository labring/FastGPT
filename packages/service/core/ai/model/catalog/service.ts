import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';

import { hashStr } from '@fastgpt/global/common/string/tools';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getModelProviderMetadata, preloadModelProviders } from '../provider/controller';
import { formatDbModelToRuntimeModel } from '../runtime';
import { desensitizeModel } from '../transform';
import {
  getCachedSystemModelHandle,
  getScopedTeamModelHandle,
  publishSystemModelHandle
} from './cache';
import { readModelCatalogRevision, readModelCatalogSnapshot } from './entity';
import { createModelHandle, type ModelHandle } from './handle';

/**
 * 只读取数据库安装实例并原子发布运行时模型快照，不执行插件请求、历史迁移或自动预装。
 */
const publishInstalledModels = async ({ language = 'en' }: { language?: string } = {}) => {
  try {
    const {
      models: dbModels,
      defaultModelIds: configuredDefaultModelIds,
      revision
    } = await readModelCatalogSnapshot({ scope: ModelScopeEnum.system });
    const _systemModelList = dbModels.map((dbModel) =>
      formatDbModelToRuntimeModel(dbModel, { language, fallbackProvider: false })
    );
    const _systemActiveModelList = _systemModelList.filter((model) => model.isActive);

    // 完整目录与内容版本一起发布，不暴露多次赋值的半成品。
    const version = hashStr(
      JSON.stringify({
        schemaVersion: 1,
        // 模型顺序属于目录内容；安装实例变化后必须触发客户端缓存更新。
        models: _systemActiveModelList.map(desensitizeModel),
        providers: getModelProviderMetadata().providers,
        defaultModelIds: configuredDefaultModelIds
      })
    );
    publishSystemModelHandle(
      createModelHandle({
        models: _systemModelList,
        configuredDefaultModelIds,
        revision,
        version
      })
    );

    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.debug('System models loaded', {
      total: _systemModelList.length,
      active: _systemActiveModelList.length
    });
  } catch (error) {
    const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
    logger.error('System models load failed', { error });

    return Promise.reject(error);
  }
};

let modelReload: Promise<void> | undefined;

/** 同一进程只允许一个加载器发布目录，避免慢的旧加载覆盖较新的快照。 */
export const loadInstalledModels = (options?: Parameters<typeof publishInstalledModels>[0]) => {
  if (!modelReload) {
    modelReload = publishInstalledModels(options).finally(() => {
      modelReload = undefined;
    });
  }
  return modelReload;
};

let modelRefresh: Promise<void> | undefined;

/**
 * 尽力读取最新目录，版本检查与快照加载总共最多等待 5 秒。
 * 失败或超时沿用已成功发布的本地快照（包括空目录）；首次加载没有快照时仍报错。
 * race 不取消底层加载，迟到的完整快照仍可正常发布，不能伪造修订号或清空旧缓存。
 */
export const refreshModelHandle = async () => {
  const refresh = async () => {
    const requiredRevision = await readModelCatalogRevision({ scope: ModelScopeEnum.system });
    while (
      !getCachedSystemModelHandle() ||
      getCachedSystemModelHandle()!.revision < requiredRevision
    ) {
      await loadInstalledModels();
    }
  };

  try {
    modelRefresh ??= refresh().finally(() => {
      modelRefresh = undefined;
    });
    await withTimeout(modelRefresh, 5000, 'Model catalog refresh timed out');
  } catch (error) {
    const handle = getCachedSystemModelHandle();
    if (!handle) throw error;
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Using local model catalog after refresh failure',
      {
        error,
        revision: handle.revision
      }
    );
  }
};

/**
 * 启动依赖 Plugin Provider 元数据；模板 listModels 不参与已安装实例的加载和运行。
 * 历史模型迁移由启动阻塞任务负责，各节点在业务启动前重载；运行期仍由读取入口按修订号刷新。
 */
export const loadSystemModels = async (refresh = false, language = 'en') => {
  if (!refresh && getCachedSystemModelHandle()) return;

  try {
    await preloadModelProviders();
    await loadInstalledModels({
      language
    });
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.CONFIG).error('System models orchestration failed', {
      error
    });
    return Promise.reject(error);
  }
};

/** 写入已提交后尽力刷新本节点，失败保留诊断；后续模型读屏障负责重试，不能误报写入失败。 */
export const updatedReloadSystemModel = async () => {
  await refreshModelHandle().catch((error) => {
    getLogger(LogCategories.MODULE.AI.CONFIG).warn(
      'Model write committed; catalog refresh pending',
      { error }
    );
  });
};

/** 读取经过修订号检查的系统目录，明确不包含任何团队模型。 */
export const getSystemModelHandle = async (): Promise<ModelHandle> => {
  await refreshModelHandle();
  const handle = getCachedSystemModelHandle();
  if (!handle) throw new UserError(ModelErrEnum.unExist);
  return handle;
};

/** 读取系统与指定团队的完整目录；teamId 必须来自鉴权身份。 */
export const getTeamModelHandle = async ({ teamId }: { teamId: string }): Promise<ModelHandle> =>
  getScopedTeamModelHandle({ teamId, systemHandle: await getSystemModelHandle() });
