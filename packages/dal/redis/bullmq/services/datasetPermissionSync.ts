import { DelayedError } from 'bullmq';
import { bullMQ, type BullMQBinding } from '../binding';
import { LeaseCache, RedisLeaseUnavailableError } from '../../caches';
import { removeSupersededFailedJobs } from '../failed-job-cleanup';
import { QueueNames } from '../names';
import { defaultWorkerOptions, fastRetryJobOptions } from '../options';
import type { Job, Processor, Queue, Worker } from '../types';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { hashStr } from '@fastgpt/global/common/string/tools';

/** 同库互斥租约：执行期间自动续租，进程崩溃后最迟 2 分钟释放。 */
const DATASET_PERMISSION_SYNC_LEASE_TTL_MS = 2 * 60 * 1000;
/** 抢不到租约时的重排间隔；moveToDelayed 不消耗 attempts。 */
const DATASET_PERMISSION_SYNC_LEASE_RETRY_DELAY_MS = 30 * 1000;

export type DatasetPermissionSyncJobData = {
  datasetId: string;
  /** 定向同步的根 collection id，作业执行时展开整棵子树；缺省 = 整库 */
  collectionIds?: string[];
  traceId?: string;
};

/**
 * 去重键。
 *
 * 全量同步按 datasetId 去重：同一知识库同一时间只需要跑一轮全量。
 * 定向同步按「dataset + 排序后的根节点指纹」去重：同一批根重复触发只保留一个 job，不同批次互不吞并。
 * 排序保证输入顺序不影响指纹。
 *
 * 生产者必须传「本次事件选中的节点」：传一个可能继续长孩子的目录时，后到的同根信号会被去重吞掉，
 * 只能等每日全量同步收敛。
 */
export const getDatasetPermissionSyncJobKey = (data: DatasetPermissionSyncJobData) => {
  const datasetId = String(data.datasetId);
  if (!data.collectionIds?.length) return datasetId;

  const fingerprint = hashStr([...data.collectionIds].map(String).sort().join(',')).slice(0, 16);
  return `${datasetId}:${fingerprint}`;
};

/** 外部文件权限同步队列的业务服务；状态全部由 BullMQ 推导，不落库。 */
export class DatasetPermissionSyncMQService {
  constructor(
    private readonly binding: BullMQBinding = bullMQ,
    private readonly leaseCache: LeaseCache = new LeaseCache()
  ) {}

  getQueue(): Queue<DatasetPermissionSyncJobData> {
    return this.binding.getQueue<DatasetPermissionSyncJobData>(QueueNames.datasetPermissionSync, {
      defaultJobOptions: fastRetryJobOptions
    });
  }

  /**
   * 注册 worker，并在 processor 外层加同库互斥与成功清理。
   *
   * 并发保护不能用全局并发 1：那是所有副本共享的一个 active，一个大数据集会堵住全部知识库。
   * 改成按 datasetId 的租约：不同库并行，同库严格串行。抢不到租约的 job 延后重排，
   * 不消耗 attempts；只有 Redis 故障等其它租约错误才让 job 失败并走重试。
   */
  getWorker(
    processor: Processor<DatasetPermissionSyncJobData>
  ): Worker<DatasetPermissionSyncJobData> {
    return this.binding.getWorker<DatasetPermissionSyncJobData>(
      QueueNames.datasetPermissionSync,
      async (job, token) => {
        const datasetId = String(job.data.datasetId);
        try {
          return await this.leaseCache.withLease({
            key: `dataset-permission-sync:${datasetId}`,
            label: 'dataset-permission-sync',
            ttlMs: DATASET_PERMISSION_SYNC_LEASE_TTL_MS,
            fn: async () => {
              const result = await processor(job, token);
              // 清理只能发生在成功路径，且失败不能把已成功的任务判失败：
              // 残留的失败记录最多让状态多显示一轮 error，下一次成功会再清。
              await this.cleanupFailedJobs(job).catch((error) => {
                this.binding.getLogger().warn('[permissionSync] remove failed jobs failed', {
                  datasetId,
                  jobId: job.id,
                  error
                });
              });
              return result;
            }
          });
        } catch (error) {
          // 同库已有任务在跑：延后重排，状态保持 waiting，不计 attempts
          if (error instanceof RedisLeaseUnavailableError && token) {
            await job.moveToDelayed(
              Date.now() + DATASET_PERMISSION_SYNC_LEASE_RETRY_DELAY_MS,
              token
            );
            throw new DelayedError();
          }
          throw error;
        }
      },
      {
        // 本地并发只控制单副本处理量；同库互斥由租约保证，提高并发即可跨库并行
        concurrency: 1,
        ...defaultWorkerOptions
      }
    );
  }

  /**
   * 删除被本次成功执行取代的失败记录。
   *
   * 调用方（worker 包装器）保证仍持有同库租约，所以同库不会有更新的失败记录在写入；
   * id 比较是租约失效时的兜底。
   */
  private async cleanupFailedJobs(job: Job<DatasetPermissionSyncJobData>) {
    const datasetId = String(job.data.datasetId);
    const isFullSync = !job.data.collectionIds?.length;

    await removeSupersededFailedJobs({
      queue: this.getQueue(),
      job,
      // 全量同步覆盖整库，连同定向失败一起清；定向同步只清相同参数（同去重键）
      match: (failedJob) => {
        if (isFullSync) return String(failedJob.data?.datasetId ?? '') === datasetId;
        return failedJob.name === job.name;
      },
      onRemoveError: (failedJob, error) => {
        this.binding.getLogger().warn('[permissionSync] remove failed job failed', {
          datasetId,
          jobId: failedJob.id,
          error
        });
      }
    });
  }

  addJob(data: DatasetPermissionSyncJobData) {
    const jobKey = getDatasetPermissionSyncJobKey(data);
    return this.getQueue().add(jobKey, data, { deduplication: { id: jobKey } });
  }

  /**
   * 复用 dataset 同步的四态：active/syncing/waiting/error。
   *
   * 定向 job 的去重键含 collectionIds 指纹，无法按 datasetId 反查 dedup id，
   * 因此改为遍历在途集合按 `data.datasetId` 过滤（active 大小有界，waiting 与待同步库数同阶）。
   * 旧一轮 failed job 与新一轮 waiting 并存时，以在途状态为准，避免已修复的错误一直顶在前台。
   */
  async getStatus(datasetId: string) {
    const queue = this.getQueue();
    const matchDataset = (job: { data?: DatasetPermissionSyncJobData }) =>
      String(job.data?.datasetId ?? '') === String(datasetId);

    const [activeJobs, waitingJobs, delayedJobs, failedJobs] = await Promise.all([
      queue.getActive(0, 20),
      queue.getWaiting(0, 500),
      queue.getDelayed(0, 500),
      // 默认按入队倒序返回，首条即最近一次失败
      queue.getFailed(0, 100)
    ]);

    if (activeJobs.some(matchDataset)) {
      return { status: DatasetStatusEnum.syncing, errorMsg: undefined };
    }
    if (waitingJobs.some(matchDataset) || delayedJobs.some(matchDataset)) {
      return { status: DatasetStatusEnum.waiting, errorMsg: undefined };
    }
    const failedJob = failedJobs.find(matchDataset);
    if (failedJob) {
      return { status: DatasetStatusEnum.error, errorMsg: failedJob.failedReason };
    }

    return { status: DatasetStatusEnum.active, errorMsg: undefined };
  }
}

export const datasetPermissionSyncMQService = new DatasetPermissionSyncMQService();
