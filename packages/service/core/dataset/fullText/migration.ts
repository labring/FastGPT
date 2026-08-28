import { randomUUID } from 'node:crypto';
import { LoadState, type MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { Types } from '../../../common/mongo';
import {
  DatasetVectorTableName,
  DatasetVectorTableNameV2,
  FULL_TEXT_WRITE_BATCH_SIZE,
  getVectorType
} from '../../../common/vectorDB/constants';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import {
  MILVUS_TEXT_MAX_LENGTH,
  truncateFullTextByBytes
} from '../../../common/vectorDB/milvus/fullTextConfig';
import {
  assertFullTextCapability,
  assertMilvusVersion
} from '../../../common/vectorDB/milvus/fullText';
import { resolveMutationErrIndex } from '../../../common/vectorDB/milvus/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  MongoFullTextMigrationFailed,
  MongoFullTextMigrationLog,
  type FullTextMigrationFailedSchemaType,
  type FullTextMigrationLogSchemaType,
  type FullTextMigrationStatus
} from './schema';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

/** 源 milvus modeldata 行读取批量上限(源读取批,区别于 FULL_TEXT_WRITE_BATCH_SIZE 目标写入片) */
const MAX_BATCH_SIZE = 2000;

/** running 日志批更新停止超过该时长视为僵死(服务重启遗留),可被续跑接管;健康单批耗时远小于此 */
const RUNNING_STALE_MS = 2 * 60 * 1000;

/** 旧表 modeldata 缺失/为空时引导使用的重建接口(全量重新嵌入,走训练队列) */
const REBUILD_EMBEDDING_API_HINT =
  'POST /api/core/dataset/training/rebuildEmbedding (rebuild from dataset_data)';

export type InitMilvusFullTextQuery = {
  batchSize?: number;
  dryRun?: boolean;
  removeOld?: boolean;
  resumeMigrationId?: string;
  /** 客户端断连取消信号:主循环每批检查,置位即停并标记 cancelled(可续跑) */
  signal?: { cancelled: boolean };
};

export type InitMilvusFullTextResult = {
  message: string;
  migrationId?: string;
  status: FullTextMigrationStatus | 'dry-run';
  newEngine: 'milvus';
  sourceCount: number;
  targetCount?: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  error?: string;
};

/** 源 milvus modeldata 向量行(迁移读取源) */
type MigrationSourceRow = {
  id: string;
  vector: number[];
  teamId: string;
  datasetId: string;
  collectionId: string;
  createTime: number;
};

/** modeldata_v2 目标行(单表:向量 + 全文 text + 归属) */
type MigrationTargetRow = {
  id: number;
  vector: number[];
  text: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  createTime: number;
};

/** text 超出 modeldata_v2 VarChar 上限时按 UTF-8 字节截断(中文等 3 字节字符,不能用 JS 字符长度) */
const truncateText = (text?: string): string => {
  return truncateFullTextByBytes(text ?? '', MILVUS_TEXT_MAX_LENGTH);
};

/** 目标集合行数统计(query 的 output_fields=['count(*)'] 分支,经 retryFn 抗瞬断) */
const countRows = async (client: MilvusClient, collection: string): Promise<number> => {
  const res = await retryFn(() =>
    client.query({
      collection_name: collection,
      output_fields: ['count(*)']
    })
  );
  return Number(res.data?.[0]?.['count(*)'] ?? 0);
};

/** 集合未加载则加载(收尾 count 前必须 load 回来,否则 query/count 报错) */
const ensureCollectionLoaded = async (client: MilvusClient, collection: string): Promise<void> => {
  const { state } = await client.getLoadState({ collection_name: collection });
  if (state === LoadState.LoadStateNotExist || state === LoadState.LoadStateNotLoad) {
    await client.loadCollectionSync({ collection_name: collection });
    logger.info(`[initMilvusFullText] loaded ${collection} collection`);
  }
};

/**
 * 源 milvus modeldata 行 + mongo dataset_data 文档 → modeldata_v2 目标行(纯函数)。
 * 按 `indexes[].dataId === vectorId` join 取 text 与归属;未命中(孤儿)行不产出,
 * 由调用方用 rows.length - targetRows.length 计 skippedCount。
 * imageEmbedding 只保留向量,BM25 文本置空(不索引图片 URL,与实时写入一致)。
 */
export const buildTargetRows = (
  rows: MigrationSourceRow[],
  dataDocs: DatasetDataSchemaType[]
): MigrationTargetRow[] => {
  const dataByVectorId = new Map<string, DatasetDataSchemaType>();
  for (const doc of dataDocs) {
    for (const index of doc.indexes ?? []) {
      if (index.dataId) dataByVectorId.set(String(index.dataId), doc);
    }
  }

  return rows.flatMap((row) => {
    const vectorId = String(row.id);
    const data = dataByVectorId.get(vectorId);
    if (!data) return [];
    const index = data.indexes?.find((i) => String(i.dataId) === vectorId);
    if (!index) return [];
    const isImage = index.type === DatasetDataIndexTypeEnum.imageEmbedding;
    return [
      {
        id: Number(vectorId),
        vector: row.vector,
        text: isImage ? '' : truncateText(index.text),
        teamId: String(data.teamId ?? row.teamId),
        datasetId: String(data.datasetId ?? row.datasetId),
        collectionId: String(data.collectionId ?? row.collectionId),
        createTime: row.createTime ?? Date.now()
      }
    ];
  });
};

/** full_text_migration_logs 的 $set 进度载荷(主循环与自愈共用) */
const buildLogUpdate = ({
  status,
  cursor,
  processed,
  skipped,
  failed
}: {
  status: FullTextMigrationStatus;
  cursor: string;
  processed: number;
  skipped: number;
  failed: number;
}) => ({
  status,
  cursor,
  processedCount: processed,
  skippedCount: skipped,
  failedCount: failed,
  updatedAt: new Date()
});

/**
 * 按源行的 teamId/datasetId/collectionId 批量 join mongo dataset_data。
 * 归属字段是用户数据,可能为空串/垃圾值,而其在 dataset_data 中是 ObjectId,
 * 直接 $in 会触发 CastError,故先经 ObjectId.isValid 过滤;非法行由调用方计 skippedCount。
 */
const fetchDataDocs = async (rows: MigrationSourceRow[]): Promise<DatasetDataSchemaType[]> => {
  const vectorIds = rows.map((r) => String(r.id));
  const teamIds = Array.from(new Set(rows.map((r) => r.teamId))).filter((id) =>
    Types.ObjectId.isValid(id)
  );
  const dataSetIds = Array.from(new Set(rows.map((r) => r.datasetId))).filter((id) =>
    Types.ObjectId.isValid(id)
  );
  const collectionIds = Array.from(new Set(rows.map((r) => r.collectionId))).filter((id) =>
    Types.ObjectId.isValid(id)
  );
  return (await MongoDatasetData.find(
    {
      teamId: { $in: teamIds },
      datasetId: { $in: dataSetIds },
      collectionId: { $in: collectionIds },
      'indexes.dataId': { $in: vectorIds }
    },
    { _id: 1, teamId: 1, datasetId: 1, collectionId: 1, indexes: 1 }
  )) as DatasetDataSchemaType[];
};

/** 失败行写入 full_text_migration_failed(按 migrationId+dataId upsert 幂等) */
const writeFailedRows = async (
  migrationId: string,
  ids: string[],
  error: unknown
): Promise<void> => {
  if (ids.length === 0) return;
  await MongoFullTextMigrationFailed.bulkWrite(
    ids.map((dataId) => ({
      updateOne: {
        filter: { migrationId, dataId },
        update: {
          $set: {
            migrationId,
            dataId,
            error: getErrText(error),
            createdAt: new Date()
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
};

/**
 * 执行单批 upsert 并按 Milvus 返回状态拆分为成功/失败行。
 * SDK 的 upsert 不校验 status.error_code:服务端失败(如 OOM/quota/集合异常)可能以
 * error_code != Success 或 err_index 部分失败表达,而 promise 不 reject;不显式校验会把
 * 失败批次计为成功。返回 { successIds, failedIds, error } 供调用方分别计数与落失败表。
 */
const upsertChunk = async (
  client: MilvusClient,
  chunk: MigrationTargetRow[]
): Promise<{ successIds: string[]; failedIds: string[]; error?: string }> => {
  const result = await retryFn(() =>
    client.upsert({ collection_name: DatasetVectorTableNameV2, data: chunk })
  );
  // 失败语义与实时 insert/delete 共用同一 helper(status.error_code / err_index 解析)
  const errIndex = resolveMutationErrIndex(result, chunk.length);

  const failedIdSet = new Set(
    errIndex.map((i) => String(chunk[i]?.id)).filter((id) => id && id !== 'undefined')
  );
  const failedIds = chunk
    .filter((row) => failedIdSet.has(String(row.id)))
    .map((row) => String(row.id));
  const successIds = chunk
    .filter((row) => !failedIdSet.has(String(row.id)))
    .map((row) => String(row.id));
  return { successIds, failedIds, error: result.status?.reason };
};

/**
 * 唯一部分索引 {newEngine:1, status:'running'} 重复键 → 转成明确的并发拒绝错误。
 * findOne 检查与 create 之间可能有 TOCTOU 窗口,索引兜底保证同引擎同时只有一个 running 日志。
 */
const toConcurrentRunningError = async (error: unknown, newEngine: 'milvus'): Promise<never> => {
  if ((error as { code?: number })?.code === 11000) {
    const running = await MongoFullTextMigrationLog.findOne({ newEngine, status: 'running' });
    throw new Error(
      `Migration already running (${running?.migrationId}). Resume it with resumeMigrationId=${running?.migrationId}; if the previous run was interrupted (server restart), resume takes over from the last batch.`
    );
  }
  throw error;
};

/**
 * 单方向(mongo->milvus)全量迁移(旧表 modeldata 纯拷贝):
 * queryIterator 遍历源 milvus modeldata 行,按 `indexes[].dataId === 向量 id` join mongo
 * dataset_data 取 text 与归属,写 modeldata_v2(不重嵌入)。imageEmbedding 只保留向量,BM25 文本置空。
 *
 * 前提:Milvus 数据仍在(旧表 modeldata 存在且有向量)。若 Milvus 数据已不存在(跨版本升级后全新实例),
 * 本接口无法拷贝向量,请改用 ${REBUILD_EMBEDDING_API_HINT} 从 dataset_data 全量重新嵌入。
 *
 * 公共语义:进度按批持久化 full_text_migration_logs,失败行落 full_text_migration_failed;
 * 断点续跑从 cursor 继续并自愈重试失败表;dryRun 只统计;
 * 收尾先确保 modeldata_v2 已加载再 flush 再计数;完成条件实际校验目标表数量(targetCount >= processed);
 * 完成后 release 旧 modeldata(removeOld=true 时显式 drop 并清空 dataset_data_texts)。
 */
export const runFullTextMigration = async (
  query: InitMilvusFullTextQuery & { client?: MilvusClient }
): Promise<InitMilvusFullTextResult> => {
  const startTime = Date.now();
  const batchSize = Math.max(1, Math.min(query.batchSize || 500, MAX_BATCH_SIZE));
  const dryRun = !!query.dryRun;
  const removeOld = !!query.removeOld;
  const signal = query.signal;

  // 1. 引擎校验:全文后端跟随实际向量库,provider 必须为 milvus
  const newEngine = 'milvus' as const;
  if (getVectorType() !== 'milvus') {
    throw new Error('Milvus vector store is required to run initMilvusFullText');
  }

  // 2. 目标能力探测:版本门禁 + modeldata_v2 的 text/sparse 字段校验
  const client = query.client ?? global.milvusClient;
  if (!client) throw new Error('Milvus client not initialized');
  await assertMilvusVersion(client);
  await assertFullTextCapability(client);

  // 3. 旧表探测/加载(全部封装在迁移脚本内,init 不碰 modeldata):
  //    存在且有数据 → 纯拷贝迁移;缺失/为空(Milvus 数据已不在)→ 报错引导走 rebuildEmbedding
  const { value: hasOldTable } = await client.hasCollection({
    collection_name: DatasetVectorTableName
  });
  if (hasOldTable) {
    await ensureCollectionLoaded(client, DatasetVectorTableName);
  }
  const sourceCount = hasOldTable ? await countRows(client, DatasetVectorTableName) : 0;
  if (sourceCount === 0) {
    throw new Error(
      `[initMilvusFullText] modeldata collection is ${
        hasOldTable ? 'empty' : 'not found'
      } (Milvus data is gone). This migration copies vectors from the old modeldata table; ` +
        `use ${REBUILD_EMBEDDING_API_HINT} to rebuild embeddings from dataset_data instead.`
    );
  }

  // 4. 断点续跑:resumeMigrationId 从 log.cursor 继续,不新建日志
  let migrationId = query.resumeMigrationId;
  let cursor = '';
  let resumeCounts = { processed: 0, skipped: 0, failed: 0 };
  if (migrationId) {
    const log = (await MongoFullTextMigrationLog.findOne({ migrationId })) as
      | (FullTextMigrationLogSchemaType & { _id: unknown })
      | null;
    if (!log) throw new Error(`Migration log not found: ${migrationId}`);
    if (log.status === 'done') throw new Error(`Migration ${migrationId} already done`);
    // running 可能是服务重启遗留的僵死日志(批更新中断,updatedAt 停在最后一批):
    // 超阈值判定旧循环已死,允许续跑接管;仍在批更新的 running 拒绝续跑。
    const staleRunning =
      log.status === 'running' && Date.now() - new Date(log.updatedAt).getTime() > RUNNING_STALE_MS;
    if (log.status === 'running' && !staleRunning) {
      throw new Error(
        `Migration ${migrationId} is still running. Interrupt the original request (curl Ctrl+C) to cancel it first.`
      );
    }
    if (log.newEngine !== newEngine) {
      throw new Error(`Migration log engine mismatch: expected ${newEngine}`);
    }
    if (staleRunning) {
      logger.warn(
        `[initMilvusFullText] take over stale running migration ${migrationId} (last batch update ${new Date(log.updatedAt).toISOString()})`
      );
    }
    // 续跑把 cancelled/failed/僵死 running 状态回 running
    try {
      await MongoFullTextMigrationLog.updateOne(
        { migrationId },
        { $set: { status: 'running', updatedAt: new Date() } }
      );
    } catch (error) {
      // 唯一部分索引 {newEngine,status:'running'} 兜底:若此刻已有其他 running 日志,拒绝续跑,
      // 避免两个循环并发处理同一批源行。
      await toConcurrentRunningError(error, newEngine);
    }
    cursor = log.cursor || '';
    // 续跑从日志续起计数:processed/skipped/failed 记录的是 cursor 之前已处理的行,
    // 否则最终计数与 sourceCount 对不上,续跑无法判定 done。
    resumeCounts = {
      processed: log.processedCount ?? 0,
      skipped: log.skippedCount ?? 0,
      failed: log.failedCount ?? 0
    };
  }

  if (dryRun) {
    return {
      message: `Dry run: ${sourceCount} source vector rows, ~${Math.max(
        1,
        Math.ceil(sourceCount / batchSize)
      )} batches (batchSize=${batchSize})`,
      migrationId,
      status: 'dry-run',
      newEngine,
      sourceCount,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      durationMs: Date.now() - startTime
    };
  }

  // 4.5 并发防护:同引擎已有 running 迁移时拒绝新启动(双跑会各循环同一批源行、日志逐批重复)。
  // 僵死 running(服务重启遗留)也不在此放行新日志,统一走 resume 接管,避免与存活循环并发。
  // dryRun(只读统计)不受影响,可随时执行。
  if (!migrationId) {
    const running = await MongoFullTextMigrationLog.findOne({ newEngine, status: 'running' });
    if (running) {
      throw new Error(
        `Migration already running (${running.migrationId}). Resume it with resumeMigrationId=${running.migrationId}; if the previous run was interrupted (server restart), resume takes over from the last batch.`
      );
    }
  }

  // 5. 新建迁移日志(断点续跑不新建)
  // findOne 预检与 create 之间存在 TOCTOU 窗口,唯一部分索引 {newEngine,status:'running'}
  // 兜底:两个并发新启动同时通过预检时,后到的 create 命中重复键,转成明确的"已在运行"错误。
  if (!migrationId) {
    migrationId = randomUUID();
    try {
      await MongoFullTextMigrationLog.create({
        migrationId,
        newEngine,
        status: 'running',
        cursor: '',
        totalCount: sourceCount,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        updatedAt: new Date(),
        createdAt: new Date()
      });
    } catch (error) {
      await toConcurrentRunningError(error, newEngine);
    }
  }

  logger.info(
    `[initMilvusFullText] migration started: migrationId=${migrationId}, sourceCount=${sourceCount}, batchSize=${batchSize}, dryRun=${dryRun}`
  );

  // 6. 分批搬运 + 进度持久化
  // 计数从 resumeCounts 续起(全新运行为 0,续跑为上次日志累积值),保证最终计数可归一到 sourceCount
  let processed = resumeCounts.processed;
  let skipped = resumeCounts.skipped;
  let failed = resumeCounts.failed;

  // 中途异常中止时把日志标记 failed,避免迁移日志永久停留在 running;
  // 已完成的批次进度仍在日志中,续跑 resumeMigrationId 可继续。
  let cancelled = false;
  try {
    // 全量遍历用 queryIterator:SDK 内部按主键递增分页、不漏行;续跑时 filter 从上次游标继续
    const iterator = await client.queryIterator({
      collection_name: DatasetVectorTableName,
      output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
      filter: cursor ? `(id > ${cursor})` : '',
      batchSize
    });

    for await (const batch of iterator) {
      // 批点取消检查:客户端断连(handler res.on close 置位 signal)即停,进度已按批持久化,续跑可继续
      if (signal?.cancelled) {
        cancelled = true;
        logger.info(
          `[initMilvusFullText] cancelled at batch boundary, processed ${processed}/${sourceCount}`
        );
        break;
      }

      const rows = (batch ?? []) as MigrationSourceRow[];
      if (rows.length === 0) continue;

      const dataDocs = await fetchDataDocs(rows);

      const targetRows = buildTargetRows(rows, dataDocs);
      skipped += rows.length - targetRows.length;

      // 目标写入片(FULL_TEXT_WRITE_BATCH_SIZE)与源读取批(batchSize)独立。
      // upsert 经 retryFn 包装(默认 3 次尝试)抗传输错误;服务端以 status/err_index 表达的
      // 失败(不 reject)由 upsertChunk 拆分,成功行计 processed、失败行计 failed 并落失败日志。
      for (let i = 0; i < targetRows.length; i += FULL_TEXT_WRITE_BATCH_SIZE) {
        const chunk = targetRows.slice(i, i + FULL_TEXT_WRITE_BATCH_SIZE);
        try {
          const { successIds, failedIds, error } = await upsertChunk(client, chunk);
          processed += successIds.length;
          // 成功后清掉失败表残留,避免续跑时重复计数/重复迁移
          if (successIds.length > 0) {
            await MongoFullTextMigrationFailed.deleteMany({
              migrationId,
              dataId: { $in: successIds }
            });
          }
          if (failedIds.length > 0) {
            failed += failedIds.length;
            await writeFailedRows(
              migrationId,
              failedIds,
              new Error(error ?? 'Milvus upsert failed')
            );
          }
        } catch (retryErr) {
          // 整批抛错(传输/客户端异常):全部失败
          failed += chunk.length;
          await writeFailedRows(
            migrationId,
            chunk.map((c) => String(c.id)),
            retryErr
          );
        }
      }

      // 游标按批内最大 id 推进,续跑从该点继续
      cursor = String(Math.max(...rows.map((r) => Number(r.id))));
      await MongoFullTextMigrationLog.updateOne(
        { migrationId },
        { $set: buildLogUpdate({ status: 'running', cursor, processed, skipped, failed }) }
      );

      logger.info(
        `[initMilvusFullText] batch done, processed ${processed}/${sourceCount}, total failed ${failed}, cursor ${cursor}`
      );
    }

    // 取消:跳过自愈/计数校验/release,进度保留在日志中,续跑从已提交的最后一个游标继续
    if (cancelled) {
      await MongoFullTextMigrationLog.updateOne(
        { migrationId },
        {
          $set: {
            status: 'cancelled',
            cursor,
            processedCount: processed,
            skippedCount: skipped,
            failedCount: failed,
            updatedAt: new Date()
          }
        }
      );
      const message = `Migration cancelled: processed ${processed}, skipped ${skipped}, failed ${failed} of ${sourceCount}. Resume with resumeMigrationId=${migrationId}.`;
      logger.info(`[initMilvusFullText] ${message}`);
      return {
        message,
        migrationId,
        status: 'cancelled',
        newEngine,
        sourceCount,
        processedCount: processed,
        skippedCount: skipped,
        failedCount: failed,
        durationMs: Date.now() - startTime
      };
    }

    // 7. 失败行自愈:重试 full_text_migration_failed 表遗留失败行。
    // 源行已删或 join 未命中(孤儿)→ 计 skipped 并从失败表移除;重试成功 → 计 processed 并移除;
    // 仍失败 → 保留失败表供下一轮续跑重试。最终 failed 数 = 失败表剩余行数。
    const failedRows = (await MongoFullTextMigrationFailed.find({ migrationId }).lean()) as
      | (FullTextMigrationFailedSchemaType & { _id: unknown })[]
      | null;
    if (failedRows && failedRows.length > 0) {
      const failedIds = failedRows.map((f) => String(f.dataId));
      // 回源读取失败行对应的源行(仍存在 → 可重试;已删 → 孤儿)
      const sourceRes = await client.query({
        collection_name: DatasetVectorTableName,
        output_fields: ['id', 'vector', 'teamId', 'datasetId', 'collectionId', 'createTime'],
        filter: `id in [${failedIds.join(',')}]`
      });
      const sourceById = new Map<string, MigrationSourceRow>();
      for (const row of (sourceRes.data ?? []) as MigrationSourceRow[]) {
        sourceById.set(String(row.id), row);
      }
      const existingRows = failedIds
        .map((id) => sourceById.get(id))
        .filter((r): r is MigrationSourceRow => !!r);
      const sourceGoneIds = failedIds.filter((id) => !sourceById.has(id));

      // 仍存在但 mongo join 未命中的行同样为孤儿
      const dataDocs = await fetchDataDocs(existingRows);
      const targetRows = buildTargetRows(existingRows, dataDocs);
      const targetById = new Map(targetRows.map((r) => [String(r.id), r]));
      const orphanIds = [
        ...sourceGoneIds,
        ...existingRows.filter((r) => !targetById.has(String(r.id))).map((r) => String(r.id))
      ];
      const retryTargets = Array.from(targetById.values());
      let recoveredOrphan = 0;
      let recoveredSuccess = 0;

      if (orphanIds.length > 0) {
        await MongoFullTextMigrationFailed.deleteMany({
          migrationId,
          dataId: { $in: orphanIds }
        });
        recoveredOrphan = orphanIds.length;
      }

      for (let i = 0; i < retryTargets.length; i += FULL_TEXT_WRITE_BATCH_SIZE) {
        const chunk = retryTargets.slice(i, i + FULL_TEXT_WRITE_BATCH_SIZE);
        try {
          const { successIds, failedIds, error } = await upsertChunk(client, chunk);
          recoveredSuccess += successIds.length;
          if (successIds.length > 0) {
            await MongoFullTextMigrationFailed.deleteMany({
              migrationId,
              dataId: { $in: successIds }
            });
          }
          if (failedIds.length > 0) {
            // 仍失败:保留失败表记录并刷新错误信息(计数不变)
            await writeFailedRows(
              migrationId,
              failedIds,
              new Error(error ?? 'Milvus upsert failed')
            );
          }
        } catch (retryErr) {
          // 仍失败:保留失败表记录并刷新错误信息(计数不变)
          await writeFailedRows(
            migrationId,
            chunk.map((c) => String(c.id)),
            retryErr
          );
        }
      }

      skipped += recoveredOrphan;
      processed += recoveredSuccess;
      failed = failedRows.length - recoveredOrphan - recoveredSuccess;
      logger.info(
        `[initMilvusFullText] self-heal: ${recoveredSuccess} recovered, ${recoveredOrphan} orphaned, ${failed} still failed`
      );
    }
  } catch (err) {
    const errText = getErrText(err);
    await MongoFullTextMigrationLog.updateOne(
      { migrationId },
      { $set: { status: 'failed', error: errText, updatedAt: new Date() } }
    );
    logger.error('[initMilvusFullText] migration aborted', { error: errText });
    throw err;
  }

  // 8. 收尾:先确保 modeldata_v2 已加载(已加载则 no-op),
  //    再 flush 保证计数反映已落盘数据,再统计目标表实际数量并校验。
  await ensureCollectionLoaded(client, DatasetVectorTableNameV2);
  await client.flush({ collection_names: [DatasetVectorTableNameV2] });
  const targetCount = await countRows(client, DatasetVectorTableNameV2);
  // 完成条件实际校验目标表数量:processed+skipped 需覆盖全部源行,且目标表实际行数 >= 已写入行数
  const countMismatch = processed + skipped !== sourceCount || targetCount < processed;
  const status: FullTextMigrationStatus = failed === 0 && !countMismatch ? 'done' : 'failed';

  if (status === 'done') {
    // release 旧表(数据保留,可回滚);removeOld=true 时显式 drop 并清空 mongo 旧全文
    await client.releaseCollection({ collection_name: DatasetVectorTableName });
    logger.info('[initMilvusFullText] released modeldata collection');
    if (removeOld) {
      await client.dropCollection({ collection_name: DatasetVectorTableName }).catch((error) => {
        logger.warn('[initMilvusFullText] drop modeldata failed (may already be gone)', {
          error: getErrText(error)
        });
      });
      // 迁移完成并校验通过后清空 dataset_data_texts(mongo 全文 token 表)。provider=milvus 时
      // 全文检索走 modeldata_v2 不读该表;迁移中途新增的数据也只写 milvus,该表必然不完整,
      // 无法作为回滚数据源,直接清空避免残留。
      await MongoDatasetDataText.deleteMany({});
      logger.info(
        '[initMilvusFullText] dropped old modeldata collection and cleared dataset_data_texts'
      );
    }
  }

  await MongoFullTextMigrationLog.updateOne(
    { migrationId },
    { $set: buildLogUpdate({ status, cursor, processed, skipped, failed }) }
  );

  const message =
    status === 'done'
      ? `Migration done: ${processed} migrated, ${skipped} skipped(orphans/invalid), ${failed} failed. source=${sourceCount}, target=${targetCount}.${removeOld ? ' modeldata dropped.' : ' modeldata released.'}`
      : countMismatch
        ? `Migration finished with count mismatch: processed+skipped(${processed + skipped}) != source(${sourceCount}) or target(${targetCount}) < processed(${processed}). Data may have changed during migration; re-run from scratch with a NEW migrationId (upsert is idempotent) to cover any gaps.`
        : `Migration finished with ${failed} failed rows. Run again with resumeMigrationId=${migrationId} to retry.`;

  return {
    message,
    migrationId,
    status,
    newEngine,
    sourceCount,
    targetCount,
    processedCount: processed,
    skippedCount: skipped,
    failedCount: failed,
    durationMs: Date.now() - startTime,
    ...(status === 'failed'
      ? {
          error: countMismatch
            ? `count mismatch: processed+skipped(${processed + skipped}) != source(${sourceCount}) or target(${targetCount}) < processed(${processed})`
            : `${failed} rows failed, resume with resumeMigrationId to retry`
        }
      : {})
  };
};
