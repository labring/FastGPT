import { NextAPI } from '@/service/middleware/entry';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getQueue, QueueNames } from '@fastgpt/service/common/bullmq';
import type { S3MQJobData } from '@fastgpt/service/common/s3/mq';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { connectionMongo } from '@fastgpt/service/common/mongo';

export type ResponseType = {
  message: string;
  retriedCount: number;
  failedCount: number;
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
 *    - responseDetail -> showQuote
 *    - showRawSource -> canDownloadSource
 */

/**
 * 功能1: 重试所有失败的 S3 删除任务
 */
async function retryFailedS3DeleteJobs(): Promise<{
  retriedCount: number;
  failedCount: number;
}> {
  const queue = getQueue<S3MQJobData>(QueueNames.s3FileDelete);
  const failedJobs = await queue.getFailed();
  console.log(`Found ${failedJobs.length} failed S3 delete jobs`);

  let retriedCount = 0;

  await batchRun(
    failedJobs,
    async (job) => {
      addLog.debug(`Retrying S3 delete job with new attempts`, { retriedCount });
      try {
        // Remove old job and recreate with new attempts
        const jobData = job.data;
        await job.remove();

        // Add new job with more attempts
        await queue.add('delete-s3-files', jobData, {
          attempts: 10,
          removeOnFail: {
            count: 10000, // 保留10000个失败任务
            age: 14 * 24 * 60 * 60 // 14 days
          },
          removeOnComplete: true,
          backoff: {
            delay: 2000,
            type: 'exponential'
          }
        });

        retriedCount++;
        console.log(`Retried S3 delete job ${job.id} with new attempts`);
      } catch (error) {
        console.error(`Failed to retry S3 delete job ${job.id}:`, error);
      }
    },
    100
  );

  return {
    retriedCount,
    failedCount: failedJobs.length
  };
}

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

  // 获取 MongoDB 原生集合，绕过 Mongoose 的严格模式
  const db = connectionMongo.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  const outLinkCollection = db.collection('outlinks');

  // 1. 为所有 share 类型的记录添加 showFullText 字段
  const shareLinks = await outLinkCollection
    .find({
      type: PublishChannelEnum.share,
      showFullText: { $exists: false } // 只查找没有 showFullText 字段的记录
    })
    .toArray();

  if (shareLinks.length > 0) {
    // 批量更新添加 showFullText 字段
    const showFullTextOps = shareLinks.map((link: any) => ({
      updateOne: {
        filter: { _id: link._id },
        update: { $set: { showFullText: link.showRawSource ?? true } }
      }
    }));

    const showFullTextResult = await outLinkCollection.bulkWrite(showFullTextOps);
    totalUpdated += showFullTextResult.modifiedCount;
    updateResults.push({
      operation: 'Add showFullText field',
      updated: showFullTextResult.modifiedCount
    });

    console.log(`Added showFullText field to ${showFullTextResult.modifiedCount} share links`);
  }

  // 2. 重命名字段：showNodeStatus -> showRunningStatus
  const showNodeStatusLinks = await outLinkCollection
    .find({
      showNodeStatus: { $exists: true },
      showRunningStatus: { $exists: false }
    })
    .toArray();

  if (showNodeStatusLinks.length > 0) {
    const renameNodeStatusOps = showNodeStatusLinks.map((link: any) => ({
      updateOne: {
        filter: { _id: link._id },
        update: [
          {
            $set: { showRunningStatus: '$showNodeStatus' }
          },
          {
            $unset: 'showNodeStatus'
          }
        ]
      }
    }));

    const renameNodeStatusResult = await outLinkCollection.bulkWrite(renameNodeStatusOps);
    totalUpdated += renameNodeStatusResult.modifiedCount;
    updateResults.push({
      operation: 'Rename showNodeStatus to showRunningStatus',
      updated: renameNodeStatusResult.modifiedCount
    });

    console.log(
      `Renamed showNodeStatus to showRunningStatus for ${renameNodeStatusResult.modifiedCount} links`
    );
  }

  // 3. 重命名字段：responseDetail -> showQuote
  const responseDetailLinks = await outLinkCollection
    .find({
      responseDetail: { $exists: true },
      showQuote: { $exists: false }
    })
    .toArray();

  if (responseDetailLinks.length > 0) {
    const renameResponseDetailOps = responseDetailLinks.map((link: any) => ({
      updateOne: {
        filter: { _id: link._id },
        update: [
          {
            $set: { showQuote: '$responseDetail' }
          },
          {
            $unset: 'responseDetail'
          }
        ]
      }
    }));

    const renameResponseDetailResult = await outLinkCollection.bulkWrite(renameResponseDetailOps);
    totalUpdated += renameResponseDetailResult.modifiedCount;
    updateResults.push({
      operation: 'Rename responseDetail to showQuote',
      updated: renameResponseDetailResult.modifiedCount
    });

    console.log(
      `Renamed responseDetail to showQuote for ${renameResponseDetailResult.modifiedCount} links`
    );
  }

  // 4. 重命名字段：showRawSource -> canDownloadSource
  const showRawSourceLinks = await outLinkCollection
    .find({
      showRawSource: { $exists: true },
      canDownloadSource: { $exists: false }
    })
    .toArray();

  if (showRawSourceLinks.length > 0) {
    const renameRawSourceOps = showRawSourceLinks.map((link: any) => ({
      updateOne: {
        filter: { _id: link._id },
        update: [
          {
            $set: { canDownloadSource: '$showRawSource' }
          },
          {
            $unset: 'showRawSource'
          }
        ]
      }
    }));

    const renameRawSourceResult = await outLinkCollection.bulkWrite(renameRawSourceOps);
    totalUpdated += renameRawSourceResult.modifiedCount;
    updateResults.push({
      operation: 'Rename showRawSource to canDownloadSource',
      updated: renameRawSourceResult.modifiedCount
    });

    console.log(
      `Renamed showRawSource to canDownloadSource for ${renameRawSourceResult.modifiedCount} links`
    );
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

  // 执行功能1: 重试 S3 删除任务
  const s3JobResult = await retryFailedS3DeleteJobs();

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
    retriedCount: s3JobResult.retriedCount,
    failedCount: s3JobResult.failedCount,
    shareLinkMigration
  };
}

export default NextAPI(handler);
