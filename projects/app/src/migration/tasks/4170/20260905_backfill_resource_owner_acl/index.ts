import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { z } from 'zod';
import {
  backfillResourceOwnerAclRecords,
  findValidOwnerResourceIds,
  initializeResourceOwnerAclSnapshot,
  readInvalidResourceOwnerAclRecords,
  readResourceOwnerAclBatch,
  resourceOwnerAclConfigs,
  type ResourceOwnerAclConfig,
  type ResourceOwnerAclFailure,
  type ResourceOwnerAclRecord
} from './service';

const VALIDATION_STAGE_KEY = 'validation';
const READ_CONCURRENCY = 20;

const StageCheckpointSchema = z.object({
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

const ResourceOwnerAclCheckpointSchema = z.object({
  version: z.literal(1),
  initialized: z.boolean(),
  stages: z.object({
    apps: StageCheckpointSchema,
    datasets: StageCheckpointSchema,
    agent_skills: StageCheckpointSchema
  })
});

type ResourceOwnerAclCheckpoint = z.infer<typeof ResourceOwnerAclCheckpointSchema>;

const emptyStageCheckpoint = () => ({
  endId: null,
  lastId: null,
  processedCount: 0,
  total: 0
});

const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
  `${record.stageKey}:${String(record.data.resourceId)}`;

const createFailedRecord = ({
  config,
  failure
}: {
  config: ResourceOwnerAclConfig;
  failure: ResourceOwnerAclFailure;
}): SystemMigrationFailedRecord => ({
  stageKey: config.stageKey,
  data: {
    collection: config.model.collection.name,
    resourceType: config.resourceType,
    resourceId: String(failure.record._id),
    teamId: failure.record.teamId == null ? null : String(failure.record.teamId)
  },
  reason: {
    message: failure.message.slice(0, systemMigrationLimits.maxErrorMessageLength)
  }
});

/**
 * 分批扫描全部 App、Dataset 和 personal Agent Skill，仅为没有有效成员 owner 的资源补 team owner。
 * 固定快照负责断点恢复，尾扫与最终校验覆盖滚动升级期间的新增数据。
 */
export const backfillResourceOwnerAcl = async (context: SystemMigrationContext) => {
  let checkpoint: ResourceOwnerAclCheckpoint = (await context.getCheckpoint(
    ResourceOwnerAclCheckpointSchema
  )) ?? {
    version: 1,
    initialized: false,
    stages: {
      apps: emptyStageCheckpoint(),
      datasets: emptyStageCheckpoint(),
      agent_skills: emptyStageCheckpoint()
    }
  };

  if (!checkpoint.initialized) {
    const snapshots = await Promise.all(
      resourceOwnerAclConfigs.map(initializeResourceOwnerAclSnapshot)
    );
    checkpoint = {
      version: 1,
      initialized: true,
      stages: {
        apps: { ...emptyStageCheckpoint(), ...snapshots[0] },
        datasets: { ...emptyStageCheckpoint(), ...snapshots[1] },
        agent_skills: { ...emptyStageCheckpoint(), ...snapshots[2] }
      }
    };
    await context.saveCheckpoint(checkpoint);
  }

  const failedRecordMap = new Map(
    (await context.getFailedRecords()).map((record) => [getFailedRecordKey(record), record])
  );
  let failedRecordSnapshotDirty = false;
  const deleteFailedRecord = (key: string) => {
    if (failedRecordMap.delete(key)) {
      failedRecordSnapshotDirty = true;
    }
  };
  const setFailedRecord = (record: SystemMigrationFailedRecord) => {
    const key = getFailedRecordKey(record);
    const current = failedRecordMap.get(key);
    const unchanged =
      current?.stageKey === record.stageKey &&
      current.reason.message === record.reason.message &&
      current.data.collection === record.data.collection &&
      current.data.resourceType === record.data.resourceType &&
      current.data.resourceId === record.data.resourceId &&
      current.data.teamId === record.data.teamId;
    if (unchanged) return;

    failedRecordMap.set(key, record);
    failedRecordSnapshotDirty = true;
  };
  /** 失败记录采用完整快照替换，仅在内容变化时触发昂贵的事务性重写。 */
  const reportFailedRecordsIfChanged = async () => {
    if (!failedRecordSnapshotDirty) return;

    await context.reportFailedRecords([...failedRecordMap.values()]);
    failedRecordSnapshotDirty = false;
  };
  const replaceStageFailures = ({
    config,
    records,
    failures
  }: {
    config: ResourceOwnerAclConfig;
    records: ResourceOwnerAclRecord[];
    failures: ResourceOwnerAclFailure[];
  }) => {
    const failuresByResourceId = new Map(
      failures.map((failure) => [String(failure.record._id), failure])
    );
    for (const record of records) {
      const failure = failuresByResourceId.get(String(record._id));
      if (failure) {
        setFailedRecord(createFailedRecord({ config, failure }));
      } else {
        deleteFailedRecord(`${config.stageKey}:${String(record._id)}`);
      }
    }
  };
  const processRecords = async ({
    config,
    records
  }: {
    config: ResourceOwnerAclConfig;
    records: ResourceOwnerAclRecord[];
  }) => {
    const result = await backfillResourceOwnerAclRecords({ config, records });
    replaceStageFailures({ config, records, failures: result.failures });
  };
  const readFailedRecord = async ({
    config,
    failedRecord
  }: {
    config: ResourceOwnerAclConfig;
    failedRecord: SystemMigrationFailedRecord;
  }) => {
    const resourceId = String(failedRecord.data.resourceId);
    const id = Types.ObjectId.isValid(resourceId) ? new Types.ObjectId(resourceId) : resourceId;
    return config.model.collection.findOne(
      { ...config.resourceFilter, _id: id as never },
      { projection: { _id: 1, teamId: 1 } }
    );
  };
  const readFailedRecords = async ({
    config,
    failedRecords
  }: {
    config: ResourceOwnerAclConfig;
    failedRecords: SystemMigrationFailedRecord[];
  }) => {
    const records: Array<Awaited<ReturnType<typeof readFailedRecord>>> = [];
    for (let index = 0; index < failedRecords.length; index += READ_CONCURRENCY) {
      records.push(
        ...(await Promise.all(
          failedRecords
            .slice(index, index + READ_CONCURRENCY)
            .map((failedRecord) => readFailedRecord({ config, failedRecord }))
        ))
      );
    }
    return records;
  };

  for (const config of resourceOwnerAclConfigs) {
    const stageCheckpoint = checkpoint.stages[config.stageKey];
    await context.reportProgress({
      key: config.stageKey,
      status: SystemMigrationStatusEnum.running,
      current: stageCheckpoint.processedCount,
      total: stageCheckpoint.total
    });

    const stageFailedRecords = [...failedRecordMap.values()].filter(
      (record) => record.stageKey === config.stageKey
    );
    for (let index = 0; index < stageFailedRecords.length; index += systemMigrationBatchSize) {
      await context.assertActive();
      const retryFailedRecords = stageFailedRecords.slice(index, index + systemMigrationBatchSize);
      const currentRetryRecords = await readFailedRecords({
        config,
        failedRecords: retryFailedRecords
      });
      const retryRecords = currentRetryRecords.flatMap<ResourceOwnerAclRecord>((record) =>
        record ? [{ _id: record._id, teamId: record.teamId }] : []
      );
      retryFailedRecords.forEach((failedRecord, recordIndex) => {
        if (!currentRetryRecords[recordIndex]) {
          deleteFailedRecord(getFailedRecordKey(failedRecord));
        }
      });
      await processRecords({ config, records: retryRecords });
      await reportFailedRecordsIfChanged();
    }

    while (stageCheckpoint.endId && stageCheckpoint.lastId !== stageCheckpoint.endId) {
      await context.assertActive();
      const records = await readResourceOwnerAclBatch({
        config,
        endId: stageCheckpoint.endId,
        lastId: stageCheckpoint.lastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      await processRecords({ config, records });
      stageCheckpoint.lastId = String(records.at(-1)!._id);
      stageCheckpoint.processedCount += records.length;
      checkpoint.stages[config.stageKey] = stageCheckpoint;
      await reportFailedRecordsIfChanged();
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: config.stageKey,
        status: SystemMigrationStatusEnum.running,
        current: stageCheckpoint.processedCount,
        total: stageCheckpoint.total
      });
    }

    let tailLastId: string | null = null;
    while (true) {
      await context.assertActive();
      const records = await readResourceOwnerAclBatch({
        config,
        lastId: tailLastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;
      await processRecords({ config, records });
      await reportFailedRecordsIfChanged();
      tailLastId = String(records.at(-1)!._id);
    }

    let invalidLastId: unknown;
    while (true) {
      await context.assertActive();
      const invalidRecords = await readInvalidResourceOwnerAclRecords({
        config,
        lastId: invalidLastId,
        limit: systemMigrationBatchSize
      });
      if (invalidRecords.length === 0) break;
      replaceStageFailures({
        config,
        records: invalidRecords,
        failures: invalidRecords.map((record) => ({
          record,
          message: 'Resource _id is not an ObjectId'
        }))
      });
      await reportFailedRecordsIfChanged();
      invalidLastId = invalidRecords.at(-1)!._id;
    }
    checkpoint.stages[config.stageKey] = stageCheckpoint;
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: config.stageKey,
      status: SystemMigrationStatusEnum.succeeded,
      current: stageCheckpoint.total,
      total: stageCheckpoint.total
    });
  }

  await context.reportProgress({
    key: VALIDATION_STAGE_KEY,
    status: SystemMigrationStatusEnum.running
  });
  for (const config of resourceOwnerAclConfigs) {
    let validationLastId: string | null = null;
    while (true) {
      await context.assertActive();
      const records = await readResourceOwnerAclBatch({
        config,
        lastId: validationLastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      const validOwnerResourceIds = await findValidOwnerResourceIds({ config, records });
      for (const record of records) {
        const failureKey = `${config.stageKey}:${String(record._id)}`;
        if (validOwnerResourceIds.has(String(record._id))) {
          deleteFailedRecord(failureKey);
        } else if (!failedRecordMap.has(failureKey)) {
          setFailedRecord(
            createFailedRecord({
              config,
              failure: { record, message: 'Resource still has no valid member Owner ACL' }
            })
          );
        }
      }
      await reportFailedRecordsIfChanged();
      validationLastId = String(records.at(-1)!._id);
    }

    let invalidLastId: unknown;
    while (true) {
      await context.assertActive();
      const invalidRecords = await readInvalidResourceOwnerAclRecords({
        config,
        lastId: invalidLastId,
        limit: systemMigrationBatchSize
      });
      if (invalidRecords.length === 0) break;
      replaceStageFailures({
        config,
        records: invalidRecords,
        failures: invalidRecords.map((record) => ({
          record,
          message: 'Resource _id is not an ObjectId'
        }))
      });
      await reportFailedRecordsIfChanged();
      invalidLastId = invalidRecords.at(-1)!._id;
    }

    const stageFailedRecords = [...failedRecordMap.values()].filter(
      (record) => record.stageKey === config.stageKey
    );
    for (let index = 0; index < stageFailedRecords.length; index += systemMigrationBatchSize) {
      await context.assertActive();
      const records = stageFailedRecords.slice(index, index + systemMigrationBatchSize);
      const currentResources = await readFailedRecords({ config, failedRecords: records });
      records.forEach((failedRecord, recordIndex) => {
        if (!currentResources[recordIndex]) {
          deleteFailedRecord(getFailedRecordKey(failedRecord));
        }
      });
      await reportFailedRecordsIfChanged();
    }
  }
  if (failedRecordMap.size > 0) {
    await context.fail({
      message: `${failedRecordMap.size} resources still lack a valid member Owner ACL`,
      failedRecords: [...failedRecordMap.values()]
    });
  }
  await context.reportProgress({
    key: VALIDATION_STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    appsProcessedCount: checkpoint.stages.apps.processedCount,
    datasetsProcessedCount: checkpoint.stages.datasets.processedCount,
    agentSkillsProcessedCount: checkpoint.stages.agent_skills.processedCount
  };
};
