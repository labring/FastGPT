import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { FullTextSearchItem, FullTextSearchProps, FullTextStore } from '../type';
import { MILVUS_ADDRESS, MILVUS_TOKEN, getDatasetVectorTableName } from '../constants';
import {
  FULL_TEXT_OVER_FETCH_FACTOR,
  FULL_TEXT_OVER_FETCH_MAX,
  MILVUS_QUERY_MAX_LENGTH,
  truncateFullTextByBytes
} from './fullTextConfig';
import { MongoDatasetData } from '../../../core/dataset/data/schema';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.VECTOR);

const MIN_MILVUS_VERSION = { major: 2, minor: 5, patch: 16 };

export const parseMilvusVersion = (
  version: string
): { major: number; minor: number; patch: number } => {
  const m = version
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Unable to parse Milvus version from server: ${version}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
};

export const assertMilvusVersion = async (client: MilvusClient): Promise<void> => {
  let version = '';
  try {
    version = (await client.getVersion()).version;
  } catch (error) {
    throw new Error(`Failed to get Milvus version: ${getErrText(error)}`);
  }
  const { major, minor, patch } = parseMilvusVersion(version);
  const belowMin =
    major < MIN_MILVUS_VERSION.major ||
    (major === MIN_MILVUS_VERSION.major && minor < MIN_MILVUS_VERSION.minor) ||
    (major === MIN_MILVUS_VERSION.major &&
      minor === MIN_MILVUS_VERSION.minor &&
      patch < MIN_MILVUS_VERSION.patch);
  if (belowMin) {
    throw new Error(
      `Milvus version ${version} is not supported. FastGPT requires Milvus 2.5.16+. Please upgrade your Milvus instance.`
    );
  }
  logger.info('Milvus version verified', { version });
};

/**
 * collection 过滤子句构建。
 * 与 embRecall(milvus/index.ts)共用同一实现,避免两处漂移。
 * 交集语义:filterCollectionIdList 与 forbidCollectionIdList 的交集项从 forbid 侧剔除
 * (不追加 forbid),同时从 filter 侧剔除(不进 filter);empty=true 表示过滤集合收缩为空,
 * 调用方应短路返回空结果不查库。
 */
export const buildCollectionFilter = (props: {
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
}): { collectionIdQuery: string; forbidColQuery: string; empty: boolean } => {
  const { forbidCollectionIdList, filterCollectionIdList } = props;

  // Forbid collection:交集项从 forbid 中剔除
  const formatForbidCollectionIdList = (() => {
    if (!filterCollectionIdList) return forbidCollectionIdList;
    return forbidCollectionIdList
      .map((id) => String(id))
      .filter((id) => !filterCollectionIdList.includes(id));
  })();
  const forbidColQuery =
    formatForbidCollectionIdList.length > 0
      ? `and (collectionId not in [${formatForbidCollectionIdList.map((id) => `"${id}"`).join(',')}])`
      : '';

  // Filter collection id:交集项从 filter 中剔除
  const formatFilterCollectionId = (() => {
    if (!filterCollectionIdList) return;
    return filterCollectionIdList
      .map((id) => String(id))
      .filter((id) => !forbidCollectionIdList.includes(id));
  })();
  const collectionIdQuery = formatFilterCollectionId
    ? `and (collectionId in [${formatFilterCollectionId.map((id) => `"${id}"`).join(',')}])`
    : ``;

  return {
    collectionIdQuery,
    forbidColQuery,
    empty: !!formatFilterCollectionId && formatFilterCollectionId.length === 0
  };
};

/**
 * 能力探测:校验 modeldata_v2 的 BM25 全文配置完整。
 * 只查字段存在不够——已存在的集合可能缺少 BM25 function、sparse 索引或 analyzer 配置
 * (旧版本/手工建集合),检索会静默失败,这里在启动/迁移前把三类配置一并核验:
 * 1. text 字段存在且配置了 analyzer(text 带 analyzer_params 才有 BM25 分词输入)
 * 2. sparse 字段存在,且存在 text -> sparse 的 BM25 function
 * 3. sparse 索引存在且 metric 为 BM25(全文检索依赖该索引)
 */
export const assertFullTextCapability = async (client: MilvusClient): Promise<void> => {
  const collectionName = getDatasetVectorTableName();
  const desc = await client.describeCollection({ collection_name: collectionName });
  const fields = desc.schema?.fields ?? [];
  const textField = fields.find((f) => f.name === 'text');
  const sparseField = fields.find((f) => f.name === 'sparse');
  const bm25Function = (desc.functions ?? []).find(
    (f) =>
      // proto 以 enums:String 加载,describeCollection 返回的 function type 是字符串 'BM25'
      // SDK 不同版本可能返回数值枚举 1 或字符串 'BM25',两者都兼容。
      (String(f.type) === 'BM25' || Number(f.type) === 1) &&
      f.input_field_names?.includes('text') &&
      f.output_field_names?.includes('sparse')
  );
  if (!textField || !sparseField || !bm25Function || !textField.analyzer_params) {
    throw new Error(
      `Milvus full-text unsupported: ${collectionName} missing BM25 function / text analyzer / sparse field (need Milvus 2.5.16+)`
    );
  }

  // sparse 索引必须为 BM25 指标,否则 BM25 检索无法命中。
  // IndexDescription 无 metric_type 顶层字段,指标在 params 键值对中。
  const indexRes = await client.describeIndex({
    collection_name: collectionName,
    index_name: 'sparse_BM25'
  });
  const sparseIndex = (indexRes.index_descriptions ?? []).find((i) => i.field_name === 'sparse');
  const metricType = (sparseIndex?.params ?? []).find((p) => p.key === 'metric_type')?.value;
  if (!sparseIndex || metricType !== 'BM25') {
    throw new Error(
      `Milvus full-text unsupported: ${collectionName} sparse index missing or metric is not BM25`
    );
  }
};

/**
 * Milvus BM25 全文实现。
 * 仅 search(写/删由向量 insert/update/delete 通道承载,单表方案全文行即向量行)。
 * 检索对 modeldata_v2 做 BM25 sparse,按向量 id 反查 dataset_data 归一化返回 dataId。
 */
export class MilvusFullTextStore implements FullTextStore {
  getClient = async (): Promise<MilvusClient> => {
    if (!MILVUS_ADDRESS) throw new Error('MILVUS_ADDRESS is not set');
    if (global.milvusClient) return global.milvusClient;

    const client = new MilvusClient({ address: MILVUS_ADDRESS, token: MILVUS_TOKEN });
    await client.connectPromise;
    global.milvusClient = client;
    return client;
  };

  async search(props: FullTextSearchProps): Promise<FullTextSearchItem[]> {
    const client = await this.getClient();
    const { teamId, datasetIds, query, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    if (!query || limit === 0 || datasetIds.length === 0) return [];

    // 查询文本按 UTF-8 字节截断:Milvus 查询上限按字节计,CJK 等 3 字节字符不能用字符数 slice
    const trimmedQuery = truncateFullTextByBytes(query, MILVUS_QUERY_MAX_LENGTH);

    // collection 过滤子句(与 embRecall 共用同一实现)
    const { collectionIdQuery, forbidColQuery, empty } = buildCollectionFilter({
      forbidCollectionIdList,
      filterCollectionIdList
    });
    if (empty) return [];

    const filterStr =
      `(teamId == "${teamId}") and (datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidColQuery}`.trim();

    // 单条数据可产出多条向量(Q/A/摘要/自定义索引),同一 dataId 的向量在 top-K 里可能聚簇:
    // 只取 limit 个向量再反查,下游按 dataId 去重后结果会不足 limit 条不同数据。
    // 策略:第一轮按 limit*FACTOR 小批量取(常见场景一次即凑满 limit);未凑满且首轮取满时,
    // 第二轮一次性取满 FULL_TEXT_OVER_FETCH_MAX 兜底(不依赖 Milvus search 的 offset 分页)。
    const fetchBatch = Math.min(limit * FULL_TEXT_OVER_FETCH_FACTOR, FULL_TEXT_OVER_FETCH_MAX);
    const dedupResults = new Map<string, { collectionId: string; score: number }>();

    const searchByLimit = (l: number) =>
      retryFn(() =>
        client.search({
          collection_name: getDatasetVectorTableName(),
          data: [trimmedQuery],
          anns_field: 'sparse',
          filter: filterStr,
          limit: l,
          // 主键需显式 output_fields,否则 SDK 不解析 id
          output_fields: ['id', 'collectionId'],
          params: { metric_type: 'BM25' }
        } as any)
      );

    // 反查 dataset_data 并按 dataId 去重写入 dedupResults;返回本批向量行数(供判断是否取满)
    const processBatch = async (searchResult: any): Promise<number> => {
      const rows = (searchResult?.results || []) as {
        score: number;
        id: string;
        collectionId?: string;
      }[];
      if (rows.length === 0) return 0;

      // 单表无冗余 dataId:按向量 id 反查 dataset_data._id(indexes[].dataId === 向量 id)。
      // 查询带上本批行的 collectionId(复合索引 {teamId,datasetId,collectionId,'indexes.dataId'} 完整前缀)以命中索引。
      // 注意:$elemMatch 投影只返回每个 doc 第一个匹配项,会丢多向量映射,故返回完整 indexes 在内存过滤。
      const vectorIds = rows.map((item) => String(item.id));
      const vectorIdSet = new Set(vectorIds);
      const collectionIds = Array.from(
        new Set(rows.map((item) => (item.collectionId ? String(item.collectionId) : '')))
      ).filter(Boolean);
      const dataDocs = await MongoDatasetData.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          ...(collectionIds.length > 0 ? { collectionId: { $in: collectionIds } } : {}),
          'indexes.dataId': { $in: vectorIds }
        },
        { _id: 1, indexes: 1 }
      ).lean();
      const vectorIdToDataId = new Map<string, string>();
      for (const doc of dataDocs) {
        for (const index of doc.indexes ?? []) {
          if (index.dataId && vectorIdSet.has(String(index.dataId))) {
            vectorIdToDataId.set(String(index.dataId), String(doc._id));
          }
        }
      }

      // 按 dataId 去重保留最高分(search 结果按分降序,首个出现即最高分),同一条数据只返回一条。
      // 反查未命中(孤儿向量/数据已删)不写入 dedupResults,避免用不存在的 dataId 填充召回预算。
      for (const item of rows) {
        const dataId = vectorIdToDataId.get(String(item.id));
        if (!dataId) continue;
        const prev = dedupResults.get(dataId);
        if (!prev || item.score > prev.score) {
          dedupResults.set(dataId, {
            collectionId: item.collectionId ?? '',
            score: item.score
          });
        }
      }

      return rows.length;
    };

    // 第一轮:小批量;常见场景(首轮即凑满 limit)只取 limit*FACTOR 条向量
    const firstCount = await processBatch(await searchByLimit(fetchBatch));
    // 第二轮兜底:首轮取满仍不足 limit 时,一次性取满上限(无 offset,兼容各版本 Milvus)
    if (
      dedupResults.size < limit &&
      firstCount === fetchBatch &&
      fetchBatch < FULL_TEXT_OVER_FETCH_MAX
    ) {
      await processBatch(await searchByLimit(FULL_TEXT_OVER_FETCH_MAX));
    }

    return Array.from(dedupResults.entries())
      .map(([dataId, { collectionId, score }]) => ({ dataId, collectionId, score }))
      .slice(0, limit);
  }

  // 写/删由向量 insert/update/delete 通道承载(单表方案全文行即向量行),milvus 实现为空操作
  async write(): Promise<void> {}
  async deleteByDataId(): Promise<void> {}
  async deleteByDatasetIds(): Promise<void> {}
  async deleteByCollectionIds(): Promise<void> {}
}

let milvusFullTextStore: MilvusFullTextStore | undefined;

export const getMilvusFullTextStore = (): MilvusFullTextStore => {
  if (!milvusFullTextStore) milvusFullTextStore = new MilvusFullTextStore();
  return milvusFullTextStore;
};
