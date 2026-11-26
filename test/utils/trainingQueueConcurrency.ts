import { expect } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import {
  getSystemInstanceConfig,
  publishSystemInstanceConfigSnapshot
} from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

type QueueCounter =
  | 'datasetParseQueueLen'
  | 'preCreatedQueueLen'
  | 'imageParseQueueLen'
  | 'imageIndexQueueLen';
type ConcurrencyField = 'parseMaxProcess' | 'vectorMaxProcess' | 'vlmMaxProcess';
type TrainingRecord = {
  _id: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  mode: TrainingModeEnum;
  retryCount: number;
  lockTime: Date;
};
type LeaseFilter = Pick<TrainingRecord, '_id' | 'mode' | 'lockTime'>;

/**
 * 在 Model 传输边界保存三个私有孤儿任务，执行真实领取、租约 CAS、清理和队列准入。
 * 任务缺少关联数据，刻意走清理分支：这里只验证并发热变更，不声称解析或模型链路。
 */
export const createTrainingQueueConcurrencyFixture = () => {
  const records = new Map<string, TrainingRecord>();
  const releases = new Map<string, () => void>();
  let claimed = 0;
  let completed = 0;
  let draining = false;

  const matchesLease = (filter: LeaseFilter) => {
    const record = records.get(String(filter._id));
    return record?.mode === filter.mode && record.lockTime.getTime() === filter.lockTime.getTime()
      ? record
      : undefined;
  };
  const model = {
    findOneAndUpdate(
      filter: {
        mode: TrainingModeEnum;
        retryCount: { $gt: number };
        lockTime: { $lte: Date };
      },
      update: { $set: { lockTime: Date } },
      options: { new: boolean }
    ) {
      expect(filter.retryCount).toEqual({ $gt: 0 });
      expect(filter.lockTime.$lte).toBeInstanceOf(Date);
      expect(options.new).toBe(true);
      const record = [...records.values()].find(
        (item) =>
          item.mode === filter.mode && item.retryCount > 0 && item.lockTime <= filter.lockTime.$lte
      );
      if (record) {
        record.lockTime = update.$set.lockTime;
        claimed++;
      }
      const query = {
        populate: () => query,
        lean: async () => {
          if (!record) return null;
          // 前两个领取分别停在 Model 响应，允许直接观察每个真实消费者的准入名额。
          if (!draining && claimed <= 2) {
            await new Promise<void>((resolve) => releases.set(record._id, resolve));
          }
          return structuredClone(record);
        }
      };
      return query;
    },
    async updateOne(filter: LeaseFilter, update: { $set?: Partial<TrainingRecord> }) {
      const record = matchesLease(filter);
      if (!record) return { matchedCount: 0 };
      Object.assign(record, update.$set);
      return { matchedCount: 1 };
    },
    async deleteOne(filter: LeaseFilter) {
      if (!matchesLease(filter)) return { deletedCount: 0 };
      records.delete(String(filter._id));
      completed++;
      return { deletedCount: 1 };
    }
  };

  /** 上调只开放新名额；下调不取消在途任务，超额循环完成本次清理后退出。 */
  const verify = async ({
    field,
    counter,
    mode,
    consume
  }: {
    field: ConcurrencyField;
    counter: QueueCounter;
    mode: TrainingModeEnum;
    consume: () => Promise<unknown>;
  }) => {
    const previousConfig = getSystemInstanceConfig();
    const counters = globalThis as unknown as Record<QueueCounter, number>;
    const previousCount = counters[counter];
    const pending: Promise<unknown>[] = [];
    const ids = ['concurrency-first', 'concurrency-second', 'concurrency-third'];
    const publishLimit = (limit: number) =>
      publishSystemInstanceConfigSnapshot({
        snapshot: resolveSystemInstanceConfig({
          performance: { dataset: { [field]: limit } }
        })
      });

    counters[counter] = 0;
    for (const id of ids) {
      records.set(id, {
        _id: id,
        teamId: 'concurrency-team',
        datasetId: 'concurrency-dataset',
        collectionId: 'concurrency-collection',
        mode,
        retryCount: 3,
        lockTime: new Date(0)
      });
    }
    try {
      publishLimit(1);
      pending.push(consume());
      await expect.poll(() => claimed).toBe(1);
      await consume();
      expect(claimed).toBe(1);
      expect(counters[counter]).toBe(1);

      publishLimit(2);
      pending.push(consume());
      await expect.poll(() => claimed).toBe(2);
      await consume();
      expect(claimed).toBe(2);
      expect(counters[counter]).toBe(2);

      publishLimit(1);
      releases.get(ids[0])!();
      await pending[0];
      expect(claimed).toBe(2);
      expect(completed).toBe(1);
      expect(counters[counter]).toBe(1);
      expect(records.size).toBe(2);

      draining = true;
      releases.get(ids[1])!();
      await pending[1];
      expect(claimed).toBe(3);
      expect(completed).toBe(3);
      expect(records.size).toBe(0);
      expect(counters[counter]).toBe(0);
    } finally {
      draining = true;
      for (const release of releases.values()) release();
      await Promise.allSettled(pending);
      records.clear();
      releases.clear();
      counters[counter] = previousCount;
      publishSystemInstanceConfigSnapshot({ snapshot: previousConfig });
    }
  };

  return { model, verify };
};
