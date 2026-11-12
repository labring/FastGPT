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
  clearLegacyMongoFullText,
  getLatestDatasetDataId,
  listDatasetDataBatchIds,
  migrateSqlFullTextRecord,
  preflightSqlFullTextRecord
} from './service';

const STAGE_KEYS = ['prepare', 'preflight', 'scan', 'validation', 'cleanup'] as const;

const CheckpointSchema = z.object({
  provider: SqlFullTextProviderSchema,
  analyzerVersion: SqlFullTextMetadataSchema.shape.analyzerVersion,
  targetId: z.uuid(),
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: z.number().int().nonnegative(),
  stage: z.enum(['scan', 'validation', 'cleanup']),
  validationEndId: ObjectIdSchema.nullable(),
  validationLastId: ObjectIdSchema.nullable(),
  validated: z.number().int().nonnegative()
});

/**
 * SQL 向量库原生全文升级迁移（恢复策略：分批断点续跑）。
 *
 * 选择分批断点续跑的原因：存量 dataset_datas 规模无上界，需按 _id 游标分批做只读预检、
 * 条件补齐 fulltext_tokens 与完整性验收，避免单次大事务阻塞业务写入或超出租约时长。
 *
 * 流程：
 * 1. prepare：准备并核验当前 SQL 检索库的词串列、全文索引与物理目标元数据；
 * 2. preflight：每次执行重新全量只读预检，发现异常先阻断写入；
 * 3. scan：按 _id 游标幂等回填 NULL 词串，保留已有向量与业务主数据；
 * 4. validation：全量分批校验所有有效索引词串已完整一致；
 * 5. cleanup：验收全部通过后清空旧 Mongo dataset_data_texts 表。
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
      validated: 0,
      deletedLegacyCount: 0
    };
  }

  const assertActive = async () => {
    context.signal.throwIfAborted();
    await context.assertActive();
  };

  // 1. 准备结构并核验目标库全文能力与持久身份。
  await assertActive();
  await context.reportProgress({ key: 'prepare', status: SystemMigrationStatusEnum.running });
  const adapter = getSqlFullTextAdapter();
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

  /** 错误只暴露业务 ID 与固定原因；有界快照先于 checkpoint 持久化。 */
  const processRecord = async (
    id: string,
    stage: 'preflight' | 'scan' | 'validation',
    validateOnly = stage === 'validation'
  ) => {
    const key = `${stage}:${id}`;
    try {
      if (stage === 'preflight') await preflightSqlFullTextRecord(id);
      else await migrateSqlFullTextRecord(id, validateOnly);
      failures.delete(key);
    } catch {
      context.signal.throwIfAborted();
      failures.set(key, {
        stageKey: stage,
        data: { id },
        reason: {
          message: 'Full-text row, ownership, input or synonym snapshot requires repair'
        }
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
        await processRecord(String(failure.data.id), stage, false);
      }
    }
    await context.reportFailedRecords([...failures.values()]);

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
        await processRecord(id, stage);
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
      if (checkpoint.stage !== 'cleanup') {
        checkpoint = { ...checkpoint, stage: 'cleanup' };
        await context.saveCheckpoint(checkpoint);
      }
    }

    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: progressCurrent(stage)
    });
  }

  // 4. 全量校验通过后清空已废弃的旧 Mongo dataset_data_texts 表。
  await assertActive();
  await context.reportProgress({ key: 'cleanup', status: SystemMigrationStatusEnum.running });
  const deletedLegacyCount = await clearLegacyMongoFullText();
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    current: deletedLegacyCount
  });

  return {
    applicable: true,
    provider: adapter.provider,
    analyzerVersion: metadata.analyzerVersion,
    targetId: metadata.targetId,
    prechecked,
    scanned: checkpoint.scanned,
    validated: checkpoint.validated,
    deletedLegacyCount
  };
};
