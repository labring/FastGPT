import { z } from 'zod';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrationBatchSize } from '@/migration/constants';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import {
  SqlFullTextProviderSchema,
  SqlFullTextMetadataSchema
} from '@fastgpt/global/core/dataset/fullText/schema';
import { getVectorType } from '@fastgpt/service/common/vectorDB/constants';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import {
  activateSqlFullTextTarget,
  clearSqlFullTextTargetReady
} from '@fastgpt/service/core/dataset/fullText/sql/entity';
import {
  SqlFullTextMigrationRecordError,
  getLatestDatasetDataId,
  listDatasetDataBatchIds,
  migrateSqlFullTextRecord
} from './service';
import { verifySqlFullTextSearch } from './probe';

const STAGE_KEYS = ['prepare', 'scan', 'validation'] as const;
const CheckpointSchema = z.object({
  provider: SqlFullTextProviderSchema,
  schemaVersion: SqlFullTextMetadataSchema.shape.schemaVersion.default(1),
  analyzerVersion: SqlFullTextMetadataSchema.shape.analyzerVersion,
  targetId: z.uuid(),
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: z.number().int().nonnegative(),
  stage: z.enum(['scan', 'validation']),
  validationEndId: ObjectIdSchema.nullable(),
  validationLastId: ObjectIdSchema.nullable(),
  validated: z.number().int().nonnegative()
});

/**
 * 手动迁移 SQL 全文，采用分批断点续跑；执行前必须排空旧 App/Pro/训练写入方。
 * 每条记录先校验源文本与历史同义词，再补 NULL；PG 物理缺失行通过 embedding 补建并 CAS 更新引用。
 * 坏记录按批保存并在重试时优先处理；回填结束后完整重验，全部通过才登记目标 ready。
 * TMP_MIGRATE_FULL_TEXT 开启时固定读 Mongo；验收只发布证据，读路由必须再等 Runner 成功终态。
 */
export const migrateSqlFullTextMigration = async (
  context: SystemMigrationContext
): Promise<SystemMigrationResultData> => {
  if (getVectorType() === 'milvus') {
    for (const key of STAGE_KEYS) {
      await context.assertActive();
      await context.reportProgress({ key, status: SystemMigrationStatusEnum.running });
      await context.reportProgress({ key, status: SystemMigrationStatusEnum.succeeded });
    }
    return { applicable: false, scanned: 0, validated: 0 };
  }

  const assertActive = async () => {
    context.signal.throwIfAborted();
    await context.assertActive();
  };

  // 1. 准备并核验目标身份；回填和验收期间清除旧 ready 证据。
  await assertActive();
  await context.reportProgress({ key: 'prepare', status: SystemMigrationStatusEnum.running });
  const adapter = getSqlFullTextAdapter();
  await clearSqlFullTextTargetReady(adapter.provider);
  const metadata = await adapter.prepare();
  await context.reportProgress({ key: 'prepare', status: SystemMigrationStatusEnum.succeeded });

  // 2. 断点只能在相同物理目标、结构版本及分词规则下恢复。
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (
    checkpoint &&
    (checkpoint.targetId !== metadata.targetId ||
      checkpoint.provider !== adapter.provider ||
      checkpoint.schemaVersion !== metadata.schemaVersion ||
      checkpoint.analyzerVersion !== metadata.analyzerVersion)
  ) {
    throw new Error('Checkpoint belongs to another SQL target or analyzer version');
  }
  if (!checkpoint) {
    checkpoint = {
      provider: adapter.provider,
      schemaVersion: metadata.schemaVersion,
      analyzerVersion: metadata.analyzerVersion,
      targetId: metadata.targetId,
      endId: await getLatestDatasetDataId(),
      lastId: null,
      scanned: 0,
      stage: 'scan',
      validationEndId: null,
      validationLastId: null,
      validated: 0
    };
  } else if (checkpoint.stage === 'scan') {
    checkpoint.endId = await getLatestDatasetDataId();
  }
  await context.saveCheckpoint(checkpoint);

  const failures = new Map<string, SystemMigrationFailedRecord>();
  for (const record of await context.getFailedRecords()) {
    failures.set(`${record.stageKey}:${record.data.id}`, record);
  }

  /** 仅将可定位的数据错误加入完整失败快照，连接/驱动异常交给 Runner 处理。 */
  const processRecord = async (id: string, stage: 'scan' | 'validation') => {
    const key = `${stage}:${id}`;
    try {
      try {
        await migrateSqlFullTextRecord(id, { validateOnly: stage === 'validation', assertActive });
      } catch (error) {
        if (stage !== 'validation' || !(error instanceof SqlFullTextMigrationRecordError)) {
          throw error;
        }
        // 中断或并发变更可能留下 NULL 或 PG 缺失行，补齐后重验。
        await assertActive();
        await migrateSqlFullTextRecord(id, { assertActive });
        await migrateSqlFullTextRecord(id, { validateOnly: true, assertActive });
      }
      failures.delete(key);
    } catch (error) {
      context.signal.throwIfAborted();
      if (!(error instanceof SqlFullTextMigrationRecordError)) throw error;
      const message = error.message.slice(0, 200);
      context.logger.warn('SQL full-text migration record validation failed', {
        stageKey: stage,
        id,
        message
      });
      failures.set(key, { stageKey: stage, data: { id }, reason: { message } });
      if (failures.size >= 1000) {
        await context.fail({
          message: 'Too many unresolved full-text records',
          failedRecords: [...failures.values()]
        });
      }
    }
  };

  // 3. 按游标回填；恢复验收时总是从头重验，不能用旧验收游标代表当前完整性。
  for (const stage of ['scan', 'validation'] as const) {
    await assertActive();
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.running,
      current: stage === 'scan' ? checkpoint.scanned : 0
    });
    if (stage === 'validation') {
      checkpoint = {
        ...checkpoint,
        stage: 'validation',
        validationEndId: await getLatestDatasetDataId(),
        validationLastId: null,
        validated: 0
      };
      await context.saveCheckpoint(checkpoint);
    }
    const current = () => (stage === 'scan' ? checkpoint!.scanned : checkpoint!.validated);

    for (const failure of [...failures.values()]) {
      if (failure.stageKey === stage) {
        await assertActive();
        await processRecord(String(failure.data.id), stage);
      }
    }
    await context.reportFailedRecords([...failures.values()]);

    const endId =
      stage === 'scan'
        ? checkpoint.stage === 'scan'
          ? checkpoint.endId
          : null
        : checkpoint.validationEndId;
    while (endId !== null) {
      await assertActive();
      const ids = await listDatasetDataBatchIds({
        endId,
        cursor: stage === 'scan' ? checkpoint.lastId : checkpoint.validationLastId,
        limit: systemMigrationBatchSize
      });
      if (ids.length === 0) break;
      for (const id of ids) await processRecord(id, stage);

      // 先持久化完整错误快照再推进游标；任一位置中断均可安全重放当前批次。
      await assertActive();
      await context.reportFailedRecords([...failures.values()]);
      if (stage === 'scan') {
        checkpoint = {
          ...checkpoint,
          lastId: ids.at(-1)!,
          scanned: checkpoint.scanned + ids.length
        };
      } else {
        checkpoint = {
          ...checkpoint,
          validationLastId: ids.at(-1)!,
          validated: checkpoint.validated + ids.length
        };
      }
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: stage,
        status: SystemMigrationStatusEnum.running,
        current: current()
      });
    }

    if (
      failures.size > 0 &&
      (stage === 'validation' ||
        [...failures.values()].some((failure) => failure.stageKey === stage))
    ) {
      await context.fail({
        message: 'Full-text migration has unresolved records',
        failedRecords: [...failures.values()]
      });
    }
    if (stage === 'validation') {
      await assertActive();
      await adapter.assertCapability();
      const current = await adapter.getMetadata();
      if (
        current.targetId !== metadata.targetId ||
        current.schemaVersion !== metadata.schemaVersion ||
        current.analyzerVersion !== metadata.analyzerVersion
      )
        throw new Error('SQL full-text target metadata changed during migration');
      await verifySqlFullTextSearch({
        adapter,
        targetId: metadata.targetId,
        runId: context.runId,
        assertActive
      });
      await assertActive();
      await activateSqlFullTextTarget({ provider: adapter.provider, ...metadata });
    }
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: current()
    });
  }

  return {
    applicable: true,
    provider: adapter.provider,
    schemaVersion: metadata.schemaVersion,
    analyzerVersion: metadata.analyzerVersion,
    targetId: metadata.targetId,
    scanned: checkpoint.scanned,
    validated: checkpoint.validated
  };
};
