import fs from 'fs';
import json5 from 'json5';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import {
  postConcatUsage,
  postCreateUsage,
  postPushUsageItems
} from '@fastgpt/service/thirdProvider/fastgptPro/api';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { refreshLLMRequestRecordTTL } from '@fastgpt/service/core/ai/record/service';
import { appEnv } from '@/env';
import { pluginTagList } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { applyRuntimeStorageConfig } from '@fastgpt/service/common/s3/config/constants';
import { initS3Buckets } from '@fastgpt/service/common/s3';
import { systemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/service';

const logger = getLogger(LogCategories.SYSTEM);
const pluginFeaturesProbeTimeoutMs = 3000;
/* Init global variables */
export function initGlobalVariables() {
  function initPlusRequest() {
    global.createUsageHandler = function createUsageHandler(data: CreateUsageProps) {
      if (!isProVersion()) return;
      return postCreateUsage(data);
    };
    global.concatUsageHandler = function concatUsageHandler(data: ConcatUsageProps) {
      if (!isProVersion()) return;
      return postConcatUsage(data);
    };
    global.pushUsageItemsHandler = function pushUsageItemsHandler(data: PushUsageItemsProps) {
      if (!isProVersion()) return;
      return postPushUsageItems(data);
    };
  }

  global.datasetParseQueueLen = global.datasetParseQueueLen ?? 0;
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  global.synonymQueueLen = global.synonymQueueLen ?? 0;
  global.preCreatedQueueLen = global.preCreatedQueueLen ?? 0;
  initPlusRequest();
}

/* Init system data(Need to connected db). It only needs to run once */
export async function getInitConfig({
  refreshLLMRequestRecordTTL = true
}: {
  refreshLLMRequestRecordTTL?: boolean;
} = {}) {
  const getSystemVersion = async () => {
    if (global.systemVersion) return;
    try {
      if (process.env.NODE_ENV === 'development') {
        global.systemVersion = process.env.npm_package_version || '0.0.0';
      } else {
        const packageJson = json5.parse(await fs.promises.readFile('/app/package.json', 'utf-8'));

        global.systemVersion = packageJson?.version;
      }
      logger.info('System version resolved', { systemVersion: global.systemVersion });
    } catch (error) {
      logger.error('System version resolve failed', { error });

      global.systemVersion = '0.0.0';
    }
  };

  await Promise.all([initSystemConfig({ refreshLLMRequestRecordTTL }), getSystemVersion()]);
}

async function getPluginRemoteDebugEnabled() {
  try {
    const features = await pluginClient.getPluginServiceFeatures({
      signal: AbortSignal.timeout(pluginFeaturesProbeTimeoutMs)
    });
    return features.remoteDebug === true;
  } catch (error) {
    logger.warn('Plugin service features resolve failed', { error });
    return false;
  }
}

type SystemConfigInitState = {
  initConfigQueue: Promise<void>;
  storageRefreshPending: boolean;
  appliedLLMRequestRecordRetentionHours?: number;
  latestLLMRequestRecordRetentionHours?: number;
  ttlRefreshQueue: Promise<void>;
  ttlRefreshInFlight: number;
};

/** 跨 Next bundle 共享重载队列与已生效的日志 TTL，避免重复检查独立日志库索引。 */
const getSystemConfigInitState = (): SystemConfigInitState => {
  const store = globalThis as typeof globalThis & {
    systemConfigInitState?: SystemConfigInitState;
  };
  return (store.systemConfigInitState ??= {
    initConfigQueue: Promise.resolve(),
    storageRefreshPending: false,
    ttlRefreshQueue: Promise.resolve(),
    ttlRefreshInFlight: 0
  });
};

/**
 * 后台串行校准日志 TTL 索引：仅在首次未同步、上次失败或 retentionHours 实际变更时执行，
 * 不阻塞配置重载队列与保存接口响应。
 */
function scheduleLLMRequestRecordTTLRefresh(targetRetentionHours: number) {
  const state = getSystemConfigInitState();
  if (
    state.ttlRefreshInFlight === 0 &&
    state.appliedLLMRequestRecordRetentionHours === targetRetentionHours
  ) {
    return;
  }

  state.ttlRefreshInFlight += 1;
  state.ttlRefreshQueue = state.ttlRefreshQueue
    .then(async () => {
      const currentHours = state.latestLLMRequestRecordRetentionHours ?? targetRetentionHours;
      if (state.appliedLLMRequestRecordRetentionHours === currentHours) return;
      const applied = await refreshLLMRequestRecordTTL();
      if (applied) {
        state.appliedLLMRequestRecordRetentionHours = currentHours;
      }
    })
    .catch((error) => {
      logger.error('Failed to refresh LLM request record TTL in background', { error });
    })
    .finally(() => {
      state.ttlRefreshInFlight -= 1;
    });
}

/**
 * 重新加载并应用全站系统配置。
 * 使用串行队列排队执行，确保并发重载按序完成，避免较早的重载在外部 I/O 慢时逆序覆写较新的运行时状态。
 */
export function initSystemConfig({
  refreshLLMRequestRecordTTL = true
}: {
  refreshLLMRequestRecordTTL?: boolean;
} = {}): Promise<void> {
  const state = getSystemConfigInitState();
  const current = state.initConfigQueue.then(() =>
    doInitSystemConfig({ refreshLLMRequestRecordTTL })
  );
  state.initConfigQueue = current.catch(() => {});
  return current;
}

async function doInitSystemConfig({
  refreshLLMRequestRecordTTL: shouldRefreshLLMRequestRecordTTL
}: {
  refreshLLMRequestRecordTTL: boolean;
}) {
  const state = getSystemConfigInitState();
  const pluginRemoteDebug = await getPluginRemoteDebugEnabled();
  systemInstanceConfig.setFrontendContext({
    pluginRemoteDebug,
    disableMarketplace: appEnv.DISABLE_MARKETPLACE,
    showGit: appEnv.SHOW_GIT,
    wecomLoginAutoRedirect: appEnv.WECOM_LOGIN_AUTO_REDIRECT,
    chineseRedirectUrl: appEnv.CHINESE_IP_REDIRECT_URL
  });
  const instanceConfig = await systemInstanceConfig.initialize();

  // 快照已经完整发布；资源应用失败保留待重试状态，不能撤销已保存的配置。
  const targetRetentionHours = instanceConfig.performance.tracking.retentionHours;
  state.latestLLMRequestRecordRetentionHours = targetRetentionHours;
  if (shouldRefreshLLMRequestRecordTTL) {
    scheduleLLMRequestRecordTTLRefresh(targetRetentionHours);
  }
  state.storageRefreshPending ||= applyRuntimeStorageConfig(instanceConfig.storage);
  if (state.storageRefreshPending) {
    initS3Buckets();
    state.storageRefreshPending = false;
  }
  logger.info('System config loaded', { scopes: Object.keys(instanceConfig) });
}

export async function initSystemPluginTags() {
  try {
    const tags = pluginTagList;

    if (tags.length > 0) {
      const bulkOps = tags.map((tag, index) => ({
        updateOne: {
          filter: { tagId: tag.id },
          update: {
            $set: {
              tagId: tag.id,
              tagName: tag.name,
              tagOrder: index,
              isSystem: true
            }
          },
          upsert: true
        }
      }));

      await MongoPluginToolTag.bulkWrite(bulkOps);
    }
  } catch (error) {
    logger.error('Error initializing system plugin tags:', { error });
  }
}

export async function initAppTemplateTypes() {
  try {
    await Promise.all(
      defaultTemplateTypes.map((templateType) => {
        return MongoTemplateTypes.updateOne(
          {
            typeId: templateType.typeId
          },
          {
            $set: {
              typeId: templateType.typeId,
              typeName: templateType.typeName
            }
          },
          {
            upsert: true
          }
        );
      })
    );
  } catch (error) {
    logger.error('Error initializing system templates:', { error });
  }
}
