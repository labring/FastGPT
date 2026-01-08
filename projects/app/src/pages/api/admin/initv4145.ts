import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { addLog } from '@fastgpt/service/common/system/log';

export type ResponseType = {
  message: string;
  shareLinkMigration: {
    totalRecords: number;
    updatedRecords: number;
    updateResults: Array<{
      operation: string;
      updated: number;
    }>;
  };
};

/**
 * 4.14.5 版本数据初始化脚本
 * 1. 重试所有失败的 S3 删除任务
 * 2. 为所有 share 类型的 OutLink 记录添加 showFullText 字段
 * 3. 重命名字段：
 *    - showNodeStatus -> showRunningStatus
 *    - responseDetail -> showCite
 *    - showRawSource -> canDownloadSource
 */

/**
 * 功能2和3: 处理 OutLink 记录的数据迁移
 * - 添加 showFullText 字段
 * - 重命名现有字段
 */
async function migrateOutLinkData(): Promise<{
  totalRecords: number;
  updatedRecords: number;
  updateResults: Array<{
    operation: string;
    updated: number;
  }>;
}> {
  let totalUpdated = 0;
  const updateResults: Array<{
    operation: string;
    updated: number;
  }> = [];

  // 1. 为所有 share 类型的记录添加 showFullText 字段
  const shareLinks = await MongoOutLink.find({
    type: PublishChannelEnum.share
  });

  for await (const link of shareLinks) {
    try {
      link.showFullText = link.showFullText ?? link.showRawSource ?? true;
      link.showRunningStatus = link.showRunningStatus ?? link.showNodeStatus ?? false;
      link.showCite = link.showCite ?? link.responseDetail ?? false;
      link.canDownloadSource = link.canDownloadSource ?? link.showRawSource ?? false;
      await link.save();
      addLog.info(`[initv4145] 迁移 OutLink 数据成功: ${link.shareId}`);
    } catch (error) {
      addLog.error('[initv4145] 迁移 OutLink 数据失败:', error);
    }
  }

  return {
    totalRecords: totalUpdated,
    updatedRecords: totalUpdated,
    updateResults
  };
}

/**
 * 主处理函数
 */
async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  // 执行功能2&3: OutLink 数据迁移
  let shareLinkMigration = {
    totalRecords: 0,
    updatedRecords: 0,
    updateResults: [] as Array<{ operation: string; updated: number }>
  };

  try {
    shareLinkMigration = await migrateOutLinkData();
  } catch (error) {
    console.error('Failed to migrate outLink data:', error);
    // 即使迁移失败，也继续返回 S3 任务处理的结果
  }

  return {
    message: `Completed v4.14.5 initialization: S3 job retries and outLink migration`,
    shareLinkMigration
  };
}

export default NextAPI(handler);
