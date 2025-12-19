import { NextAPI } from '@/service/middleware/entry';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getQueue, QueueNames } from '@fastgpt/service/common/bullmq';
import type { S3MQJobData } from '@fastgpt/service/common/s3/mq';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type ResponseType = {
  message: string;
  retriedCount: number;
  failedCount: number;
};

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });
  const queue = getQueue<S3MQJobData>(QueueNames.s3FileDelete);

  // Get all failed jobs and retry them
  const failedJobs = await queue.getFailed();
  console.log(`Found ${failedJobs.length} failed jobs`);

  let retriedCount = 0;

  await batchRun(
    failedJobs,
    async (job) => {
      addLog.debug(`Retrying job with 3 new attempts`, { retriedCount });
      try {
        // Remove old job and recreate with new attempts
        const jobData = job.data;
        await job.remove();

        // Add new job with 3 more attempts
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
        console.log(`Retried job ${job.id} with 3 new attempts`);
      } catch (error) {
        console.error(`Failed to retry job ${job.id}:`, error);
      }
    },
    100
  );

  return {
    message: 'Successfully retried all failed S3 delete jobs with 3 new attempts',
    retriedCount,
    failedCount: failedJobs.length
  };
}

export default NextAPI(handler);
