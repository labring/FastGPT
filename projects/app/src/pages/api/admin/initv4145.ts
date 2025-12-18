import { NextAPI } from '@/service/middleware/entry';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getQueue, QueueNames } from '@fastgpt/service/common/bullmq';
import type { S3MQJobData } from '@fastgpt/service/common/s3/mq';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

export type ResponseType = {
  message: string;
  retriedCount: number;
  failedCount: number;
  shareLinkMigration: {
    totalRecords: number;
    updatedRecords: number;
  };
};

/**
 * 4.14.5 版本数据初始化脚本
 * 1. 重试所有失败的 S3 删除任务
 * 2. 为所有 share 类型的 OutLink 记录添加 showFullText 字段
 */
async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  // 1. 处理失败的 S3 删除任务
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

  // 2. 处理 share 类型的 OutLink 记录迁移
  let shareLinkMigration = { totalRecords: 0, updatedRecords: 0 };

  try {
    // 查找所有 share 类型且没有 showFullText 字段的记录
    const shareLinks = await MongoOutLink.find({
      type: PublishChannelEnum.share,
      showFullText: { $exists: false }
    }).lean();

    shareLinkMigration.totalRecords = shareLinks.length;

    if (shareLinks.length > 0) {
      // 批量更新
      const bulkOps = shareLinks.map((link) => ({
        updateOne: {
          filter: { _id: link._id },
          update: { $set: { showFullText: link.showRawSource ?? true } }
        }
      }));

      const result = await MongoOutLink.bulkWrite(bulkOps);
      shareLinkMigration.updatedRecords = result.modifiedCount;

      console.log(
        `Migration completed: ${shareLinkMigration.updatedRecords}/${shareLinkMigration.totalRecords} share links updated`
      );
    } else {
      console.log('No share link records need migration');
    }
  } catch (error) {
    console.error('Failed to migrate share links:', error);
    // 即使迁移失败，也继续返回 S3 任务处理的结果
  }

  return {
    message: `Completed S3 delete job retries and share link migration for v4.14.5`,
    retriedCount,
    failedCount: failedJobs.length,
    shareLinkMigration
  };
}

export default NextAPI(handler);
