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
import { Types } from '@fastgpt/service/common/mongo';
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
  migrateSqlFullTextRecord,
  preflightSqlFullTextRecord
} from './service';

const STAGE_KEYS = ['prepare', 'preflight', 'scan', 'validation'] as const;

const CheckpointSchema = z.object({
  provider: SqlFullTextProviderSchema,
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
 * SQL 向量库原生全文升级迁移（手动确认触发，恢复策略：分批断点续跑）。
 *
 * 选择手动触发与分批断点续跑的原因：
 * 1. 需待集群所有 App/Pro 节点及旧训练消费者升级排空后再执行切读，避免旧写入方在验收后继续插入 NULL 词串；
 * 2. 存量 dataset_datas 规模无上界，需按 _id 游标分批做只读预检、条件补齐 fulltext_tokens 与完整性验收。
 *
 * 流程：
 * 1. prepare：准备并核验当前 SQL 检索库的词串列、全文索引与物理目标元数据，迁移未完成前保持旧 Mongo 兼容读取；
 * 2. preflight：每次执行重新全量只读预检，发现异常先阻断写入；
 * 3. scan：按 _id 游标幂等回填 NULL 词串，保留已有向量、业务主数据与旧 Mongo 全文表；
 * 4. validation：全量分批校验所有有效索引词串已完整一致后，标记当前物理 SQL 目标就绪并平滑切换读取。
 */
export const migrateSqlFullTextMigration = async (
  context: SystemMigrationContext
): Promise<SystemMigrationResultData> => {
  // Milvus 已使用独立原生全文路径，直接顺序完成各阶段并返回不适用标记。
  if (getVectorType() === 'milvus') {
    for (const key of STAGE_KEYS) {
      await context.assertActive();
      await context.reportProgress({ key, status: SystemMigrationStatusEnum.running });
      await context.reportProgress({ key, status: SystemMigrationStatusEnum.succeeded });
    }
    return {
      applicable: false,
      prechecked: 0,
      scanned: 0,
      validated: 0
    };
  }

  const assertActive = async () => {
    context.signal.throwIfAborted();
    await context.assertActive();
  };

  // 1. 准备结构并核验目标库全文能力与持久身份；验收完成前清除就绪标记以保持 Mongo 兼容读取。
  await assertActive();
  await context.reportProgress({ key: 'prepare', status: SystemMigrationStatusEnum.running });
  const adapter = getSqlFullTextAdapter();
  await clearSqlFullTextTargetReady(adapter.provider);
  const metadata = await adapter.prepare();
  await adapter.assertCapability();
  await context.reportProgress({ key: 'prepare', status: SystemMigrationStatusEnum.succeeded });

  // 2. 读取或初始化与当前物理目标及分词签名绑定的 checkpoint。
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (
    checkpoint &&
    (checkpoint.targetId !== metadata.targetId ||
      checkpoint.provider !== adapter.provider ||
      checkpoint.analyzerVersion !== metadata.analyzerVersion)
  ) {
    throw new Error('Checkpoint belongs to another SQL target or analyzer version');
  }
  const resumedStage = checkpoint?.stage ?? null;
  const resumedScanLastId = checkpoint?.lastId ?? null;
  if (!checkpoint) {
    checkpoint = {
      provider: adapter.provider,
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
    await context.saveCheckpoint(checkpoint);
  }

  const failures = new Map<string, SystemMigrationFailedRecord>();
  for (const record of await context.getFailedRecords()) {
    failures.set(`${record.stageKey}:${record.data.id}`, record);
  }

  /** 判断某条记录在本次续跑中是否被 scan 游标跳过，用于恢复验收时安全补齐重新出现的 NULL 行。 */
  const wasSkippedByCurrentScan = (id: string) => {
    if (resumedStage === 'validation') return true;
    const normalizedId = new Types.ObjectId(id).toString();
    if (resumedStage === 'scan' && resumedScanLastId !== null) {
      if (normalizedId <= new Types.ObjectId(resumedScanLastId).toString()) {
        return true;
      }
    }
    return (
      checkpoint!.endId === null || normalizedId > new Types.ObjectId(checkpoint!.endId).toString()
    );
  };

  /** 仅捕获可预期单记录数据错误并记录有界原因，底层数据库异常直接上抛给 Runner。 */
  const processRecord = async ({
    id,
    stage,
    validateOnly = stage === 'validation'
  }: {
    id: string;
    stage: 'preflight' | 'scan' | 'validation';
    validateOnly?: boolean;
  }) => {
    const key = `${stage}:${id}`;
    try {
      if (stage === 'preflight') {
        await preflightSqlFullTextRecord(id);
      } else if (stage === 'validation' && validateOnly && wasSkippedByCurrentScan(id)) {
        try {
          await migrateSqlFullTextRecord(id, true);
        } catch (error) {
          if (!(error instanceof SqlFullTextMigrationRecordError)) {
            throw error;
          }
          // 旧游标之前的记录若在中断期间被置回 NULL，先执行条件补 NULL（不覆盖冲突值）再重新验收。
          await migrateSqlFullTextRecord(id, false);
          await migrateSqlFullTextRecord(id, true);
        }
      } else {
        await migrateSqlFullTextRecord(id, validateOnly);
      }
      failures.delete(key);
    } catch (error) {
      context.signal.throwIfAborted();
      if (!(error instanceof SqlFullTextMigrationRecordError)) {
        throw error;
      }
      const message = error.message.slice(0, 200);
      context.logger.warn('SQL full-text migration record validation failed', {
        stageKey: stage,
        id,
        message
      });
      failures.set(key, {
        stageKey: stage,
        data: { id },
        reason: { message }
      });
      if (failures.size >= 1000) {
        await context.fail({
          message: 'Too many unresolved full-text records',
          failedRecords: [...failures.values()]
        });
      }
    }
  };

  // 3. 依次执行只读预检、分批回填与全量校验；预检游标仅在当次运行有效，重试时始终重新检查。
  await assertActive();
  const preflightEndId = await getLatestDatasetDataId();
  let preflightLastId: string | null = null;
  let prechecked = 0;
  const progressCurrent = (stage: 'preflight' | 'scan' | 'validation') => {
    if (stage === 'preflight') return prechecked;
    return stage === 'scan' ? checkpoint!.scanned : checkpoint!.validated;
  };

  for (const stage of ['preflight', 'scan', 'validation'] as const) {
    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.running,
      current: progressCurrent(stage)
    });
    await assertActive();

    // 优先重放该阶段上次记录的失败项；validation 失败项若已被置回 NULL 允许一并补齐再校验。
    for (const failure of [...failures.values()]) {
      if (failure.stageKey === stage) {
        await processRecord({ id: String(failure.data.id), stage, validateOnly: false });
      }
    }
    await context.reportFailedRecords([...failures.values()]);

    if (stage === 'scan' && checkpoint.stage === 'scan' && resumedStage === 'scan') {
      const latestScanEndId = await getLatestDatasetDataId();
      if (latestScanEndId !== checkpoint.endId) {
        checkpoint = {
          ...checkpoint,
          endId: latestScanEndId
        };
        await context.saveCheckpoint(checkpoint);
      }
    }

    if (stage === 'validation' && checkpoint.stage === 'scan') {
      if (failures.size > 0) {
        await context.fail({
          message: 'Full-text backfill is incomplete',
          failedRecords: [...failures.values()]
        });
      }
      checkpoint = {
        ...checkpoint,
        stage: 'validation',
        validationEndId: await getLatestDatasetDataId()
      };
      await context.saveCheckpoint(checkpoint);
    } else if (stage === 'validation' && resumedStage === 'validation') {
      // 恢复进入验收时重置旧验收游标，确保激活前完整重验当前全部有效记录。
      checkpoint = {
        ...checkpoint,
        validationEndId: await getLatestDatasetDataId(),
        validationLastId: null,
        validated: 0
      };
      await context.saveCheckpoint(checkpoint);
    }

    const endId: string | null = (() => {
      if (stage === 'preflight') return preflightEndId;
      if (stage === 'scan') return checkpoint.stage === 'scan' ? checkpoint.endId : null;
      return checkpoint.stage === 'validation' ? checkpoint.validationEndId : null;
    })();

    while (endId !== null) {
      await assertActive();
      const cursor: string | null = (() => {
        if (stage === 'preflight') return preflightLastId;
        return stage === 'scan' ? checkpoint.lastId : checkpoint.validationLastId;
      })();
      const ids = await listDatasetDataBatchIds({
        endId,
        cursor,
        limit: systemMigrationBatchSize
      });
      if (ids.length === 0) break;

      for (const id of ids) {
        await processRecord({ id, stage });
      }
      await assertActive();
      await context.reportFailedRecords([...failures.values()]);

      const batchLastId = ids.at(-1)!;
      if (stage === 'preflight') {
        preflightLastId = batchLastId;
        prechecked += ids.length;
      } else if (stage === 'scan') {
        checkpoint = {
          ...checkpoint,
          lastId: batchLastId,
          scanned: checkpoint.scanned + ids.length
        };
        await context.saveCheckpoint(checkpoint);
      } else {
        checkpoint = {
          ...checkpoint,
          validationLastId: batchLastId,
          validated: checkpoint.validated + ids.length
        };
        await context.saveCheckpoint(checkpoint);
      }

      await context.reportProgress({
        key: stage,
        status: SystemMigrationStatusEnum.running,
        current: progressCurrent(stage)
      });
    }

    if ([...failures.values()].some((failure) => failure.stageKey === stage)) {
      await context.fail({
        message: 'Full-text migration has unresolved records',
        failedRecords: [...failures.values()]
      });
    }

    if (stage === 'preflight') {
      await assertActive();
      await adapter.assertCapability();
    }

    if (stage === 'validation') {
      if (failures.size > 0) {
        await context.fail({
          message: 'Full-text migration has unresolved records',
          failedRecords: [...failures.values()]
        });
      }
      await assertActive();
      await adapter.assertCapability();
      await activateSqlFullTextTarget({
        provider: adapter.provider,
        ...metadata
      });
    }

    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: progressCurrent(stage)
    });
  }

  return {
    applicable: true,
    provider: adapter.provider,
    analyzerVersion: metadata.analyzerVersion,
    targetId: metadata.targetId,
    prechecked,
    scanned: checkpoint.scanned,
    validated: checkpoint.validated
  };
};
