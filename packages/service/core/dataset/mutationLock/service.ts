import { randomUUID } from 'node:crypto';
import { Types, type ClientSession } from '../../../common/mongo';
import {
  DatasetMutationLockOwnerTypeEnum,
  type DatasetMutationLockType
} from '@fastgpt/global/core/dataset/synonym';
import { MongoDatasetMutationLock } from './schema';

const defaultLeaseMs = 30_000;

export class DatasetMutationLockedError extends Error {
  constructor() {
    super('知识库正在更新，请稍后重试');
    this.name = 'DatasetMutationLockedError';
  }
}

/**
 * 通过单条 findOneAndUpdate 竞争知识库写入锁。并发 upsert 产生的唯一键冲突
 * 与条件未命中语义相同，统一转换为业务忙错误。
 */
export const acquireDatasetMutationLock = async ({
  teamId,
  datasetId,
  ownerId,
  ownerType,
  leaseMs = defaultLeaseMs
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  ownerType: DatasetMutationLockOwnerTypeEnum;
  leaseMs?: number;
}): Promise<DatasetMutationLockType> => {
  if (ownerType !== DatasetMutationLockOwnerTypeEnum.synonymJob) {
    throw new Error('普通数据写入必须使用共享 mutation gate');
  }
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);

  try {
    const lock = await MongoDatasetMutationLock.findOneAndUpdate(
      {
        teamId,
        datasetId,
        $and: [
          { $or: [{ leaseUntil: { $lte: now } }, { ownerId }, { ownerId: { $exists: false } }] },
          { sharedOwners: { $not: { $elemMatch: { leaseUntil: { $gt: now } } } } }
        ]
      },
      {
        $set: {
          ownerId,
          ownerType,
          leaseUntil,
          updateTime: now
        },
        $inc: { fencingToken: 1 }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    if (!lock) throw new DatasetMutationLockedError();
    return lock;
  } catch (error) {
    if (
      error instanceof DatasetMutationLockedError ||
      (error as { code?: number }).code === 11000
    ) {
      throw new DatasetMutationLockedError();
    }
    throw error;
  }
};

/** 原子获取普通写入共享租约；有效独占锁存在时快速失败。 */
export const acquireDatasetMutationSharedLock = async ({
  teamId,
  datasetId,
  ownerId,
  leaseMs = defaultLeaseMs
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  leaseMs?: number;
}) => {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const acquire = (upsert: boolean) =>
    MongoDatasetMutationLock.findOneAndUpdate(
      {
        teamId,
        datasetId,
        $or: [{ leaseUntil: { $lte: now } }, { ownerId: { $exists: false } }]
      },
      [
        {
          $set: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            fencingToken: { $ifNull: ['$fencingToken', 0] },
            leaseUntil: { $ifNull: ['$leaseUntil', new Date(0)] },
            sharedOwners: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$sharedOwners', []] },
                    as: 'owner',
                    cond: {
                      $and: [
                        { $gt: ['$$owner.leaseUntil', now] },
                        { $ne: ['$$owner.ownerId', ownerId] }
                      ]
                    }
                  }
                },
                [{ ownerId, leaseUntil }]
              ]
            },
            updateTime: now
          }
        }
      ],
      { new: true, upsert }
    ).lean();
  try {
    const lock = await acquire(true);
    if (!lock) throw new DatasetMutationLockedError();
    return { ownerId, leaseUntil };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const lock = await acquire(false);
      if (lock) return { ownerId, leaseUntil };
    }
    if (
      error instanceof DatasetMutationLockedError ||
      (error as { code?: number }).code === 11000
    ) {
      throw new DatasetMutationLockedError();
    }
    throw error;
  }
};

/** 续期普通写入共享租约，租约已丢失时阻止继续执行。 */
export const renewDatasetMutationSharedLock = async ({
  teamId,
  datasetId,
  ownerId,
  leaseMs = defaultLeaseMs
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  leaseMs?: number;
}) => {
  const now = new Date();
  const result = await MongoDatasetMutationLock.updateOne(
    {
      teamId,
      datasetId,
      sharedOwners: { $elemMatch: { ownerId, leaseUntil: { $gt: now } } }
    },
    {
      $set: {
        'sharedOwners.$[owner].leaseUntil': new Date(now.getTime() + leaseMs),
        updateTime: now
      }
    },
    { arrayFilters: [{ 'owner.ownerId': ownerId, 'owner.leaseUntil': { $gt: now } }] }
  );
  if (result.modifiedCount !== 1) throw new DatasetMutationLockedError();
};

/** 释放普通写入共享租约；只移除当前 owner。 */
export const releaseDatasetMutationSharedLock = async ({
  teamId,
  datasetId,
  ownerId
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
}) => {
  await MongoDatasetMutationLock.updateOne(
    { teamId, datasetId },
    { $pull: { sharedOwners: { ownerId } }, $set: { updateTime: new Date() } }
  );
};

/** 在普通写入提交前确认共享租约仍有效。 */
export const assertDatasetMutationSharedLock = async ({
  teamId,
  datasetId,
  ownerId,
  session
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  session?: ClientSession;
}) => {
  const query = MongoDatasetMutationLock.exists({
    teamId,
    datasetId,
    sharedOwners: { $elemMatch: { ownerId, leaseUntil: { $gt: new Date() } } }
  });
  if (session) query.session(session);
  if (!(await query)) throw new DatasetMutationLockedError();
};

/** 续期时不递增 fencing token，只有当前 owner 和 token 完全匹配才能成功。 */
export const renewDatasetMutationLock = async ({
  teamId,
  datasetId,
  ownerId,
  fencingToken,
  leaseMs = defaultLeaseMs
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  fencingToken: number;
  leaseMs?: number;
}) => {
  const now = new Date();
  const result = await MongoDatasetMutationLock.updateOne(
    { teamId, datasetId, ownerId, fencingToken, leaseUntil: { $gt: now } },
    {
      $set: {
        leaseUntil: new Date(now.getTime() + leaseMs),
        updateTime: now
      }
    }
  );
  if (result.modifiedCount !== 1) throw new DatasetMutationLockedError();
};

/** 在关键提交前校验租约和 fencing token，阻止超时恢复的旧 worker 写入。 */
export const assertDatasetMutationLock = async ({
  teamId,
  datasetId,
  ownerId,
  fencingToken,
  session
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  fencingToken: number;
  session?: ClientSession;
}) => {
  const query = MongoDatasetMutationLock.findOne({
    teamId,
    datasetId,
    ownerId,
    fencingToken,
    leaseUntil: { $gt: new Date() }
  });
  if (session) query.session(session);
  const lock = await query.lean();
  if (!lock) throw new DatasetMutationLockedError();
  return lock;
};

/** 仅当前 owner 可以释放锁；陈旧 owner 的释放请求不会影响新租约。 */
export const releaseDatasetMutationLock = async ({
  teamId,
  datasetId,
  ownerId,
  fencingToken
}: {
  teamId: string;
  datasetId: string;
  ownerId: string;
  fencingToken: number;
}) => {
  await MongoDatasetMutationLock.updateOne(
    { teamId, datasetId, ownerId, fencingToken },
    {
      $unset: { ownerId: '', ownerType: '' },
      $set: { leaseUntil: new Date(0), updateTime: new Date() }
    }
  );
};

/** 为普通数据变更提供短租约封装；synonym job 使用显式 acquire/renew/release。 */
export const withDatasetMutationGate = async <T>({
  teamId,
  datasetId,
  operation,
  run,
  leaseMs = defaultLeaseMs
}: {
  teamId: string;
  datasetId: string;
  operation: string;
  run: (lock: { ownerId: string }) => Promise<T>;
  leaseMs?: number;
}): Promise<T> => {
  const ownerId = `${operation}:${randomUUID()}`;
  await acquireDatasetMutationSharedLock({ teamId, datasetId, ownerId, leaseMs });
  let renewalError: unknown;
  const renewTimer = setInterval(
    () => {
      void renewDatasetMutationSharedLock({ teamId, datasetId, ownerId, leaseMs }).catch(
        (error) => {
          renewalError = error;
        }
      );
    },
    Math.max(1000, Math.floor(leaseMs / 3))
  );

  try {
    const result = await run({ ownerId });
    if (renewalError) throw renewalError;
    return result;
  } finally {
    clearInterval(renewTimer);
    await releaseDatasetMutationSharedLock({ teamId, datasetId, ownerId }).catch(() => {});
  }
};

/**
 * 按 datasetId 稳定排序后嵌套获取多个共享租约，避免批量删除跨知识库时形成锁顺序死锁。
 */
export const withDatasetMutationGates = async <T>({
  teamId,
  datasetIds,
  operation,
  run
}: {
  teamId: string;
  datasetIds: string[];
  operation: string;
  run: () => Promise<T>;
}): Promise<T> => {
  const ids = Array.from(new Set(datasetIds.map(String))).sort();
  const acquireAt = (index: number): Promise<T> => {
    const datasetId = ids[index];
    if (!datasetId) return run();
    return withDatasetMutationGate({
      teamId,
      datasetId,
      operation,
      run: () => acquireAt(index + 1)
    });
  };
  return acquireAt(0);
};
