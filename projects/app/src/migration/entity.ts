import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput,
  SystemMigrationProgressInput,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { connectionMongo, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState,
  type SystemMigrationStateSchemaType
} from './mongoSchema';

type ActiveRunProps = {
  migrationId: string;
  runId: string;
};

/** 只允许仍处于 running、runId 匹配且 lease 未过期的执行者修改运行结果。 */
const getActiveRunFilter = ({ migrationId, runId }: ActiveRunProps) => ({
  _id: migrationId,
  status: SystemMigrationStatusEnum.running,
  runId,
  $expr: {
    $gt: ['$leaseExpireAt', '$$NOW']
  }
});

/** failed 仅供阻塞任务继续 heartbeat；非阻塞失败会由 runner 主动停止续租。 */
const getOwnedLeaseFilter = ({ migrationId, runId }: ActiveRunProps) => ({
  _id: migrationId,
  status: {
    $in: [SystemMigrationStatusEnum.running, SystemMigrationStatusEnum.failed]
  },
  runId,
  $expr: {
    $gt: ['$leaseExpireAt', '$$NOW']
  }
});

/** 复用调用方事务；普通 runner 调用则创建事务，保证状态和错误明细同步提交。 */
const runWithMigrationSession = <T>(
  session: ClientSession | undefined,
  action: (session: ClientSession) => Promise<T>
) => (session ? action(session) : mongoSessionRun(action));

/**
 * 在调用方事务内替换某次迁移当前持久化的完整错误快照。
 * 使用替换语义而不是 append，保证批次重放时不会重复累积同一条坏数据。
 */
const replaceMigrationFailedRecordDocuments = async ({
  migrationId,
  runId,
  failedRecords,
  createdAt,
  session
}: ActiveRunProps & {
  failedRecords: SystemMigrationFailedRecord[];
  createdAt: Date;
  session: ClientSession;
}) => {
  await MongoSystemMigrationFailedRecord.deleteMany({ migrationId }, { session });

  const batchSize = 500;
  for (let offset = 0; offset < failedRecords.length; offset += batchSize) {
    await MongoSystemMigrationFailedRecord.insertMany(
      failedRecords.slice(offset, offset + batchSize).map((record) => ({
        migrationId,
        runId,
        ...record,
        createdAt
      })),
      { session, ordered: true }
    );
  }
};

/** 幂等创建当前静态注册表对应的状态文档，已存在的运行状态不会被覆盖。 */
export const ensureMigrationStates = async (migrationIds: string[], session?: ClientSession) => {
  if (migrationIds.length === 0) return;

  const now = new Date();
  await MongoSystemMigrationState.bulkWrite(
    migrationIds.map((migrationId) => ({
      updateOne: {
        filter: { _id: migrationId },
        update: {
          $setOnInsert: {
            _id: migrationId,
            status: SystemMigrationStatusEnum.pending,
            createdAt: now,
            updatedAt: now
          }
        },
        upsert: true
      }
    })),
    { ordered: false, session }
  );
};

/** 从主库读取注册表状态；执行顺序和 readiness 不能使用可能延迟的 secondary。 */
export const getMigrationStates = async (
  migrationIds: string[]
): Promise<SystemMigrationStateSchemaType[]> => {
  if (migrationIds.length === 0) return [];
  return MongoSystemMigrationState.find({ _id: { $in: migrationIds } }).lean();
};

/** 读取单个任务最近保存的错误数据；状态表本身不再承载明细数组。 */
export const getMigrationFailedRecords = async (
  migrationId: string,
  stageKey?: string
): Promise<SystemMigrationFailedRecord[]> => {
  const records = await MongoSystemMigrationFailedRecord.find(
    { migrationId, ...(stageKey ? { stageKey } : {}) },
    { _id: 0, stageKey: 1, data: 1, reason: 1 }
  )
    .sort({ _id: 1 })
    .lean();
  return records.map(({ stageKey, data, reason }) => ({ stageKey, data, reason }));
};

export type SystemMigrationFailedRecordCount = {
  migrationId: string;
  stageKey: string;
  count: number;
};

/** 按任务和阶段实时聚合错误数量，状态表不再维护可能漂移的冗余计数。 */
export const getMigrationFailedRecordCounts = async (
  migrationIds: string[]
): Promise<SystemMigrationFailedRecordCount[]> => {
  if (migrationIds.length === 0) return [];

  const counts = await MongoSystemMigrationFailedRecord.aggregate<{
    _id: { migrationId: string; stageKey: string };
    count: number;
  }>([
    { $match: { migrationId: { $in: migrationIds } } },
    {
      $group: {
        _id: { migrationId: '$migrationId', stageKey: '$stageKey' },
        count: { $sum: 1 }
      }
    }
  ]);

  return counts.map(({ _id, count }) => ({ ..._id, count }));
};

/** 返回 Mongo 主节点时间，供页面判断 lease 是否过期，避免依赖 App 宿主机时钟。 */
export const getMigrationServerTime = async (): Promise<Date> => {
  const database = connectionMongo.connection.db;
  if (!database) throw new Error('MongoDB is not connected');

  const { localTime } = await database.command({ hello: 1 });
  if (!(localTime instanceof Date)) {
    throw new Error('MongoDB hello response does not contain localTime');
  }
  return localTime;
};

/**
 * 原子获取 pending 或 lease 已过期的 running/failed 任务。
 * 所有 lease 时间由 MongoDB 的 $$NOW 生成，避免多节点宿主机时钟偏差。
 */
export const claimMigrationLease = async (
  {
    migrationId,
    runId,
    leaseDurationMs
  }: {
    migrationId: string;
    runId: string;
    leaseDurationMs: number;
  },
  session?: ClientSession
): Promise<SystemMigrationStateSchemaType | null> => {
  // 单条 findOneAndUpdate 同时完成资格判断和执行权转移，多节点不会获得同一个 runId。
  return MongoSystemMigrationState.findOneAndUpdate(
    {
      _id: migrationId,
      $or: [
        { status: SystemMigrationStatusEnum.pending },
        {
          status: {
            $in: [SystemMigrationStatusEnum.running, SystemMigrationStatusEnum.failed]
          },
          $expr: {
            $lte: [{ $ifNull: ['$leaseExpireAt', new Date(0)] }, '$$NOW']
          }
        }
      ]
    },
    [
      {
        $set: {
          status: SystemMigrationStatusEnum.running,
          runId,
          startedAt: { $ifNull: ['$startedAt', '$$NOW'] },
          lastStartedAt: '$$NOW',
          heartbeatAt: '$$NOW',
          // 新一轮执行开始后，旧成功结果不再代表本轮状态。
          result: '$$REMOVE',
          leaseExpireAt: {
            // 使用 Mongo 服务端时间，避免不同容器宿主机的时钟偏差影响抢占判断。
            $dateAdd: {
              startDate: '$$NOW',
              unit: 'millisecond',
              amount: leaseDurationMs
            }
          },
          updatedAt: '$$NOW'
        }
      }
    ],
    { new: true, session }
  ).lean();
};

/** 仅允许当前仍有效的 runId 续租，过期执行器不能把自己重新续活。 */
export const renewMigrationLease = async (
  {
    migrationId,
    runId,
    leaseDurationMs
  }: ActiveRunProps & {
    leaseDurationMs: number;
  },
  session?: ClientSession
): Promise<boolean> => {
  const result = await MongoSystemMigrationState.updateOne(
    getOwnedLeaseFilter({ migrationId, runId }),
    [
      {
        $set: {
          heartbeatAt: '$$NOW',
          leaseExpireAt: {
            $dateAdd: {
              startDate: '$$NOW',
              unit: 'millisecond',
              amount: leaseDurationMs
            }
          },
          updatedAt: '$$NOW'
        }
      }
    ],
    { session }
  );
  return result.modifiedCount === 1;
};

/** 检查调用方是否仍持有未过期 lease，用于每个业务批次开始前的主动防护。 */
export const isMigrationLeaseActive = async ({
  migrationId,
  runId
}: ActiveRunProps): Promise<boolean> => {
  return Boolean(
    await MongoSystemMigrationState.exists(getActiveRunFilter({ migrationId, runId }))
  );
};

/** 保存最近 checkpoint；runId fencing 防止已失权节点覆盖新执行器的恢复位置。 */
export const saveMigrationCheckpoint = async (
  {
    migrationId,
    runId,
    checkpoint
  }: ActiveRunProps & {
    checkpoint: Record<string, unknown>;
  },
  session?: ClientSession
): Promise<boolean> => {
  const result = await MongoSystemMigrationState.updateOne(
    getActiveRunFilter({ migrationId, runId }),
    {
      $set: {
        checkpoint,
        updatedAt: new Date()
      }
    },
    { session }
  );
  return result.modifiedCount === 1;
};

/**
 * 当前 lease 持有者即时替换完整错误快照。
 * 状态时间和错误明细在同一事务提交；调用方应先保存本批错误快照，再推进 checkpoint，
 * 这样即使两次 Context 调用之间退出，接管节点也只会重放批次，不会跳过未记录的坏数据。
 */
export const saveMigrationFailedRecords = async (
  {
    migrationId,
    runId,
    failedRecords
  }: ActiveRunProps & {
    failedRecords: SystemMigrationFailedRecord[];
  },
  session?: ClientSession
): Promise<boolean> => {
  return runWithMigrationSession(session, async (activeSession) => {
    const now = new Date();
    const updateResult = await MongoSystemMigrationState.updateOne(
      getActiveRunFilter({ migrationId, runId }),
      {
        $set: { updatedAt: now }
      },
      { session: activeSession }
    );
    if (updateResult.matchedCount !== 1) return false;

    await replaceMigrationFailedRecordDocuments({
      migrationId,
      runId,
      failedRecords,
      createdAt: now,
      session: activeSession
    });
    return true;
  });
};

/**
 * 按 key 覆盖单个阶段的最新状态；首次上报的阶段原子追加到数组。
 * 状态写入始终带 runId fencing，失去 lease 后不能更新任何阶段。
 */
export const saveMigrationProgress = async (
  {
    migrationId,
    runId,
    progress
  }: ActiveRunProps & {
    progress: SystemMigrationProgressInput;
  },
  session?: ClientSession
): Promise<boolean> => {
  const now = new Date();
  const storedProgress = {
    ...progress,
    updatedAt: now
  };
  const updateResult = await MongoSystemMigrationState.updateOne(
    {
      ...getActiveRunFilter({ migrationId, runId }),
      'progress.key': progress.key
    },
    {
      $set: {
        'progress.$': storedProgress,
        updatedAt: now
      }
    },
    { session }
  );
  // 相同毫秒重复上报相同值也属于成功；是否仍持有 lease 由 matchedCount 判断。
  if (updateResult.matchedCount === 1) return true;

  const appendResult = await MongoSystemMigrationState.updateOne(
    {
      ...getActiveRunFilter({ migrationId, runId }),
      'progress.key': { $ne: progress.key }
    },
    {
      $push: { progress: storedProgress },
      $set: { updatedAt: now }
    },
    { session }
  );
  return appendResult.matchedCount === 1;
};

/** 当前 lease 持有者完成任务后原子写入成功终态。 */
export const completeMigration = async (
  {
    migrationId,
    runId,
    result: migrationResult
  }: ActiveRunProps & {
    result?: SystemMigrationResultData;
  },
  session?: ClientSession
): Promise<boolean> => {
  return runWithMigrationSession(session, async (activeSession) => {
    const now = new Date();
    const updateResult = await MongoSystemMigrationState.updateOne(
      getActiveRunFilter({ migrationId, runId }),
      {
        $set: {
          status: SystemMigrationStatusEnum.succeeded,
          ...(migrationResult ? { result: migrationResult } : {}),
          completedAt: now,
          updatedAt: now
        },
        $unset: {
          // 成功是终态；清除旧失败信息，避免页面把已恢复任务继续展示为异常。
          leaseExpireAt: '',
          runId: '',
          lastError: '',
          ...(migrationResult ? {} : { result: '' })
        }
      },
      { session: activeSession }
    );
    if (updateResult.modifiedCount !== 1) return false;

    // 只有状态成功写入时才删除错误数据；事务失败会同时回滚两项修改。
    await MongoSystemMigrationFailedRecord.deleteMany({ migrationId }, { session: activeSession });
    return true;
  });
};

/**
 * 当前 lease 持有者写入最近错误；只有显式携带 failedRecords 才替换错误快照。
 * 阻塞类型是否继续续租由 runner 决定。
 */
export const failMigration = async (
  {
    migrationId,
    runId,
    stageKey,
    error
  }: ActiveRunProps & {
    stageKey?: string;
    error: SystemMigrationFailureInput;
  },
  session?: ClientSession
): Promise<boolean> => {
  return runWithMigrationSession(session, async (activeSession) => {
    const now = new Date();
    const { failedRecords, ...lastError } = error;
    const failedStageKeys = new Set(failedRecords?.map((record) => record.stageKey) ?? []);
    const storedError = {
      ...lastError,
      stageKey,
      runId,
      createdAt: now
    };
    const result = await MongoSystemMigrationState.updateOne(
      getActiveRunFilter({ migrationId, runId }),
      {
        $set: {
          status: SystemMigrationStatusEnum.failed,
          lastError: storedError,
          ...(stageKey
            ? {
                'progress.$[stage].status': SystemMigrationStatusEnum.failed,
                'progress.$[stage].error': storedError,
                'progress.$[stage].updatedAt': now
              }
            : {}),
          updatedAt: now
        }
      },
      {
        session: activeSession,
        ...(stageKey ? { arrayFilters: [{ 'stage.key': stageKey }] } : {})
      }
    );
    if (result.modifiedCount !== 1) return false;

    // 一次失败可能携带多个阶段的坏数据；各阶段独立标记异常，数量在列表查询时聚合。
    for (const failedStageKey of failedStageKeys) {
      const stageUpdateResult = await MongoSystemMigrationState.updateOne(
        {
          _id: migrationId,
          status: SystemMigrationStatusEnum.failed,
          runId,
          'progress.key': failedStageKey
        },
        {
          $set: {
            'progress.$[stage].status': SystemMigrationStatusEnum.failed,
            ...(failedStageKey === stageKey ? { 'progress.$[stage].error': storedError } : {}),
            'progress.$[stage].updatedAt': now
          }
        },
        {
          session: activeSession,
          arrayFilters: [{ 'stage.key': failedStageKey }]
        }
      );
      if (stageUpdateResult.matchedCount === 0) {
        // 即使任务在上报该阶段 running 前汇总出坏数据，页面也必须看到该阶段失败。
        await MongoSystemMigrationState.updateOne(
          {
            _id: migrationId,
            status: SystemMigrationStatusEnum.failed,
            runId,
            'progress.key': { $ne: failedStageKey }
          },
          {
            $push: {
              progress: {
                key: failedStageKey,
                status: SystemMigrationStatusEnum.failed,
                ...(failedStageKey === stageKey ? { error: storedError } : {}),
                updatedAt: now
              }
            }
          },
          { session: activeSession }
        );
      }
    }

    if (failedRecords !== undefined) {
      // 显式快照（包括空数组）才替换旧明细；普通 throw 必须保留已即时上报的坏数据。
      await replaceMigrationFailedRecordDocuments({
        migrationId,
        runId,
        failedRecords,
        createdAt: now,
        session: activeSession
      });
    }
    return true;
  });
};

/**
 * 管理员确认修复后解除失败任务的旧 lease，使其重新进入竞争。
 * checkpoint、progress 和错误信息全部保留，恢复语义与阻塞任务重启后的 lease 接管一致。
 */
export const resetFailedMigration = async (
  migrationId: string,
  session?: ClientSession
): Promise<boolean> => {
  const result = await MongoSystemMigrationState.updateOne(
    {
      _id: migrationId,
      status: SystemMigrationStatusEnum.failed
    },
    {
      $set: {
        status: SystemMigrationStatusEnum.pending,
        updatedAt: new Date()
      },
      $unset: {
        // 只移除旧执行者的所有权；新 runId 会从原 checkpoint 继续。
        runId: '',
        heartbeatAt: '',
        leaseExpireAt: ''
      }
    },
    { session }
  );
  return result.modifiedCount === 1;
};
