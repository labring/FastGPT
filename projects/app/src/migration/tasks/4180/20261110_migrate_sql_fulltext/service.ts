import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  getDatasetSynonymConfig,
  getDatasetSynonymMatcher
} from '@fastgpt/service/core/dataset/synonym/entity';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import type { SqlFullTextRow } from '@fastgpt/service/common/vectorDB/fullText/type';
import {
  SqlFullTextDataError,
  assertSqlFullText,
  assertSqlFullTextVectorId
} from '@fastgpt/service/common/vectorDB/fullText/utils';
import { Types } from '@fastgpt/service/common/mongo';
import { isDatasetDataIndexed } from '@fastgpt/global/core/dataset/data/utils';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { DatasetDataIndexOperation } from '@/service/core/dataset/data/dataIndex';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

/**
 * 标记单条业务记录的数据完整性、归属或历史同义词快照错误。
 * 仅此类可预期数据错误记入 failedRecords；数据库连接、超时或 SQL 驱动异常原样上抛给 Runner。
 */
export class SqlFullTextMigrationRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlFullTextMigrationRecordError';
  }
}

/** 将单记录向量 ID 或文本契约校验异常归入单条可定位错误，底层连接/驱动异常原样上抛。 */
const withRecordDataErrorBoundary = async <T>(action: () => Promise<T>): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SqlFullTextDataError) {
      throw new SqlFullTextMigrationRecordError(error.message);
    }
    throw error;
  }
};

/** 按索引记录的历史同义词版本重建输入，图片全文为空；不能用当前词表猜测历史。 */
export const buildSqlFullTextRows = async (
  data: DatasetDataSchemaType
): Promise<SqlFullTextRow[]> =>
  withRecordDataErrorBoundary(async () => {
    const teamId = String(data.teamId);
    const datasetId = String(data.datasetId);
    const version = data.synonymVersion ?? 0;
    // 图片没有全文输入，明确的版本 0 也不依赖词表；迁移不能额外要求这些历史快照。
    const needsHistory =
      data.indexes.some((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding) &&
      (data.synonymVersion === undefined || version > 0);
    const config = needsHistory ? await getDatasetSynonymConfig({ teamId, datasetId }) : null;
    if (data.synonymVersion === undefined && config && config.version > 0) {
      throw new SqlFullTextMigrationRecordError(
        'Historical synonym version is missing; rebuild this data before migrating'
      );
    }
    const matcher =
      needsHistory && version > 0 && !(config?.version === version && !config.enabled)
        ? await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: version })
        : undefined;
    if (matcher && !matcher.hasMappings) {
      throw new SqlFullTextMigrationRecordError('Historical synonym snapshot is unavailable');
    }
    return data.indexes.map((index) => {
      assertSqlFullTextVectorId(index.dataId);
      const text =
        index.type === DatasetDataIndexTypeEnum.imageEmbedding
          ? ''
          : (matcher?.transform(index.text).transformedText ?? index.text);
      assertSqlFullText(text);
      return {
        vectorId: index.dataId,
        teamId,
        datasetId,
        collectionId: String(data.collectionId),
        text
      };
    });
  });

/** 读取当前 dataset_datas 主库最大 _id 作为分批扫描或校验的固定上界。 */
export const getLatestDatasetDataId = async (): Promise<string | null> => {
  const last = await MongoDatasetData.findOne()
    .sort({ _id: -1 })
    .select('_id')
    .read('primary')
    .lean();
  return last ? String(last._id) : null;
};

/** 按固定上界与游标顺序读取下一批业务记录 ID。 */
export const listDatasetDataBatchIds = async ({
  endId,
  cursor,
  limit
}: {
  endId: string;
  cursor: string | null;
  limit: number;
}): Promise<string[]> => {
  const records: Pick<DatasetDataSchemaType, '_id'>[] = await MongoDatasetData.find({
    _id: {
      $lte: new Types.ObjectId(endId),
      ...(cursor !== null ? { $gt: new Types.ObjectId(cursor) } : {})
    }
  })
    .select('_id')
    .sort({ _id: 1 })
    .limit(limit)
    .read('primary')
    .lean();
  return records.map((record) => String(record._id));
};

/**
 * 回填只补 NULL；确认物理行缺失后，仅为仍有效的索引补建向量和全文并 CAS 替换引用。
 * 验收模式只读；并发编辑、删除和重建不能被修复覆盖，已有归属或词串冲突始终报错。
 */
const processSqlFullTextRecord = async ({
  id,
  validateOnly,
  assertActive
}: {
  id: string;
  validateOnly: boolean;
  assertActive: () => Promise<void>;
}): Promise<number> =>
  withRecordDataErrorBoundary(async () => {
    const data = await MongoDatasetData.findById(id).read('primary').lean();
    if (!data) return 0;
    const expected = await buildSqlFullTextRows(data);
    const adapter = getSqlFullTextAdapter();
    const invalid = new Set(await adapter.fill(expected, validateOnly));
    const current = await MongoDatasetData.findById(id).read('primary').lean();
    if (!current) return 0;
    const snapshot = current;
    const currentRows = await buildSqlFullTextRows(current);
    const currentById = new Map(currentRows.map((row) => [row.vectorId, row]));
    const invalidActiveIds: string[] = [];
    for (const row of expected) {
      const active = currentById.get(row.vectorId);
      if (!active) continue;
      if (
        active.text !== row.text ||
        active.teamId !== row.teamId ||
        active.datasetId !== row.datasetId ||
        active.collectionId !== row.collectionId
      ) {
        throw new SqlFullTextMigrationRecordError(
          'Active vector row is missing, has wrong ownership, or has conflicting full text'
        );
      }
      if (invalid.has(row.vectorId)) invalidActiveIds.push(row.vectorId);
    }
    if (invalidActiveIds.length) {
      if (validateOnly) {
        throw new SqlFullTextMigrationRecordError(
          'Active vector row requires repair or has conflicting full text'
        );
      }
      const missingIds = new Set(await adapter.findMissingVectorIds(invalidActiveIds));
      if (invalidActiveIds.some((vectorId) => !missingIds.has(vectorId))) {
        throw new SqlFullTextMigrationRecordError(
          'Active vector row has wrong ownership or conflicting full text'
        );
      }
      await repairMissingVectors();
      // 补建分配新 ID，必须重新读取 Mongo 并只读核对实际提交后的所有引用。
      return processSqlFullTextRecord({ id, validateOnly: true, assertActive });
    }
    return expected.filter((row) => currentById.has(row.vectorId)).length;

    /** 复用索引生成入口，原文和历史同义词版本不变；失败只清理本次新建的向量。 */
    async function repairMissingVectors() {
      if (!isDatasetDataIndexed(snapshot.indexStatus)) {
        throw new SqlFullTextMigrationRecordError(
          'Data is awaiting indexing or rebuilding; retry after it completes'
        );
      }
      const dataset = await MongoDataset.findOne({
        _id: snapshot.datasetId,
        teamId: snapshot.teamId
      })
        .select('vectorModelId vectorModel')
        .read('primary')
        .lean();
      if (!dataset)
        throw new SqlFullTextMigrationRecordError(
          'Dataset is missing; cannot resolve embedding model'
        );
      const modelHandle = await getTeamModelHandle({ teamId: String(snapshot.teamId) });
      const reference = getDatasetModelReference(dataset, 'embedding');
      if (!reference.modelId && !reference.model) {
        throw new SqlFullTextMigrationRecordError('Dataset embedding model reference is missing');
      }
      const model = (() => {
        try {
          return modelHandle.getModelData(reference, {
            type: 'embedding'
          });
        } catch {
          throw new SqlFullTextMigrationRecordError('Dataset embedding model is unavailable');
        }
      })();
      await checkTeamAIPoints(String(snapshot.teamId));
      await assertActive();
      const operation = new DatasetDataIndexOperation(model);
      const missing = new Set(invalidActiveIds);
      const indexes = snapshot.indexes.filter((index) => missing.has(index.dataId));
      if (new Set(indexes.map((index) => index.dataId)).size !== indexes.length) {
        throw new SqlFullTextMigrationRecordError(
          'Duplicate vector references cannot be repaired automatically'
        );
      }
      const transformed = new Map(
        snapshot.indexes.flatMap((index, n) =>
          index.type === DatasetDataIndexTypeEnum.imageEmbedding
            ? []
            : [[index.text, currentRows[n].text] as const]
        )
      );
      const result = await operation.insertVectors({
        indexes: indexes.map((index) => ({ ...index })),
        teamId: String(snapshot.teamId),
        datasetId: String(snapshot.datasetId),
        collectionId: String(snapshot.collectionId),
        transformText: (text) => transformed.get(text) ?? text
      });
      const newIds = result.indexes.map((index) => index.dataId);
      try {
        if (result.indexes.length !== indexes.length) {
          throw new SqlFullTextMigrationRecordError(
            'Some missing indexes could not generate vectors (check image source/model)'
          );
        }
        await assertActive();
        await mongoSessionRun(async (session) => {
          // 模型切换与重建可能同时发生；旧模型结果不能写进新配置下的数据。
          const activeDataset = await MongoDataset.findOne({
            _id: dataset._id,
            teamId: snapshot.teamId,
            vectorModelId: dataset.vectorModelId ?? { $exists: false },
            vectorModel: dataset.vectorModel ?? { $exists: false }
          })
            .session(session)
            .lean();
          if (!activeDataset)
            throw new SqlFullTextMigrationRecordError(
              'Dataset embedding model changed; retry repair'
            );
          const replacements = new Map(indexes.map((index, n) => [index.dataId, newIds[n]]));
          const updated = await MongoDatasetData.updateOne(
            {
              _id: snapshot._id,
              teamId: snapshot.teamId,
              datasetId: snapshot.datasetId,
              collectionId: snapshot.collectionId,
              updateTime: snapshot.updateTime,
              indexes: snapshot.indexes,
              indexStatus: snapshot.indexStatus ?? { $exists: false },
              synonymVersion: snapshot.synonymVersion ?? { $exists: false }
            },
            {
              $set: {
                indexes: snapshot.indexes.map((index) => ({
                  ...index,
                  dataId: replacements.get(index.dataId) ?? index.dataId
                })),
                updateTime: new Date()
              }
            },
            { session }
          );
          if (updated.matchedCount !== 1) {
            throw new SqlFullTextMigrationRecordError(
              'Data changed or was deleted during vector repair; retry'
            );
          }
        });
      } catch (error) {
        // 提交结果不确定时先核对引用；主库不可读就留给孤儿清理，不能误删可能已提交的新向量。
        await (async () => {
          const active = await MongoDatasetData.findById(id)
            .select('indexes')
            .read('primary')
            .lean();
          const referenced = new Set(active?.indexes.map((index) => index.dataId));
          await operation.deleteVectors({
            teamId: String(snapshot.teamId),
            datasetId: String(snapshot.datasetId),
            idList: newIds.filter((vectorId) => !referenced.has(vectorId))
          });
        })().catch(() => {});
        throw error;
      }
      pushGenerateVectorUsage({
        teamId: String(snapshot.teamId),
        tmbId: String(snapshot.tmbId),
        inputTokens: result.tokens,
        model
      });
    }
  });

/** 回填或验收单条业务块；模型调用及引用提交前检查执行权，直接调用时也支持只读验收。 */
export const migrateSqlFullTextRecord = (
  id: string,
  {
    validateOnly = false,
    assertActive = async () => {}
  }: {
    validateOnly?: boolean;
    assertActive?: () => Promise<void>;
  } = {}
) => processSqlFullTextRecord({ id, validateOnly, assertActive });
