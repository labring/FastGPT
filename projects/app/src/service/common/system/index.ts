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
import { configureLLMRequestRecordTTLIndex } from '@fastgpt/service/core/ai/record/schema';
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

let initConfigQueue: Promise<void> = Promise.resolve();
let storageRefreshPending = false;

/**
 * 重新加载并应用全站系统配置。
 * 使用串行队列排队执行，确保并发重载按序完成，避免较早的重载在外部 I/O 慢时逆序覆写较新的运行时状态。
 */
export function initSystemConfig({
  refreshLLMRequestRecordTTL = true
}: {
  refreshLLMRequestRecordTTL?: boolean;
} = {}): Promise<void> {
  const current = initConfigQueue.then(() => doInitSystemConfig({ refreshLLMRequestRecordTTL }));
  initConfigQueue = current.catch(() => {});
  return current;
}

async function doInitSystemConfig({
  refreshLLMRequestRecordTTL: shouldRefreshLLMRequestRecordTTL
}: {
  refreshLLMRequestRecordTTL: boolean;
}) {
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
  // 日志 TTL 仅在启动期（shouldRefreshLLMRequestRecordTTL=true）及配置保存事务内操作日志库，
  // 普通重载仅同步内存 Schema 声明，避免轮询与无关保存查询独立日志库。
  if (shouldRefreshLLMRequestRecordTTL) {
    await refreshLLMRequestRecordTTL();
  } else {
    const expireAfterSeconds = instanceConfig.performance.tracking.retentionHours * 60 * 60;
    if (
      Number.isSafeInteger(expireAfterSeconds) &&
      expireAfterSeconds > 0 &&
      expireAfterSeconds <= 2_147_483_647
    ) {
      configureLLMRequestRecordTTLIndex(expireAfterSeconds);
    }
  }
  storageRefreshPending ||= applyRuntimeStorageConfig(instanceConfig.storage);
  if (storageRefreshPending) {
    initS3Buckets();
    storageRefreshPending = false;
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
