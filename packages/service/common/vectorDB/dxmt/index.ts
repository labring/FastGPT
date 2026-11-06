/* DXMT vector crud */
import { customNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetVectorTableName } from '../constants';
import type { VectorControllerType } from '../type';
import { dxmtRequest, readPayload, type DxmtCondition, type DxmtFilter } from './controller';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.VECTOR);

const VECTOR_DIM = 1536;
/** 按时间扫描时每页记录数（cron 清理孤儿向量使用）。 */
const LIST_PAGE_SIZE = 1000;

const table = encodeURIComponent(DatasetVectorTableName);
const equal = (key: string, value: string): DxmtCondition => ({
  key,
  operation: { type: 'Equal', value }
});
const within = (key: string, values: string[]): DxmtCondition => ({
  key,
  operation: { type: 'In', value: values }
});

/**
 * DXMT 向量库适配器。
 *
 * 每条向量是 `modeldata` 表中的一条记录：`id` 为 16 位数字字符串（与 Milvus 相同的生成方式，
 * 保证在 JS 安全整数范围内），payload 携带 `team_id`、`dataset_id`、`collection_id` 和
 * `createtime`（毫秒时间戳，供 cron 按时间扫描）。所有删除、计数、召回都以 `team_id` 作为
 * 必选过滤条件，与 PG 实现的隔离边界一致。距离度量为内积（dot），返回分数越大越相似。
 */
export class DxmtVectorCtrl implements VectorControllerType {
  constructor() {}

  /** 建表；表已存在时忽略（DXMT 返回 TABLE_ALREADY_EXISTS）。payload 字段默认全部建索引。 */
  init = async () => {
    try {
      await dxmtRequest('POST', '/tables', {
        name: DatasetVectorTableName,
        dimension: VECTOR_DIM,
        distance_metric: 'dot'
      });
      logger.info('DXMT vector table created');
    } catch (error) {
      if ((error as { code?: string }).code === 'TABLE_ALREADY_EXISTS') {
        logger.info('DXMT vector initialization completed');
        return;
      }
      logger.error('DXMT vector initialization failed', { error });
    }
  };

  insert: VectorControllerType['insert'] = async (props) => {
    const { teamId, datasetId, collectionId, vectors } = props;
    // 首位 1-8、共 16 位，最大值小于 2^53，下游按字符串或数字处理都安全
    const generateId = () => `${customNanoid('12345678', 1)}${customNanoid('1234567890', 15)}`;
    const createtime = Date.now();

    const records = vectors.map((vector) => ({
      id: generateId(),
      vector,
      payload: {
        team_id: String(teamId),
        dataset_id: String(datasetId),
        collection_id: String(collectionId),
        createtime
      }
    }));

    const result = await dxmtRequest<{ inserted_ids?: string[]; failed_count?: number }>(
      'POST',
      `/tables/${table}/records`,
      { records }
    );
    const insertIds = result?.inserted_ids || [];
    if (insertIds.length !== records.length) {
      return Promise.reject(
        `insertDatasetData: DXMT inserted ${insertIds.length} of ${records.length} vectors`
      );
    }
    return { insertIds: insertIds.map(String) };
  };

  /** 仅刷新当前团队指定向量的 createtime；不存在或不属于该团队的 id 直接跳过。 */
  refreshCreateTime: VectorControllerType['refreshCreateTime'] = async ({ teamId, idList }) => {
    if (idList.length === 0) return;
    const createtime = Date.now();

    // 先按团队过滤出确实存在的 id，避免跨团队修改
    const owned: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { records?: { id: string }[]; next_cursor?: string | null } = await dxmtRequest(
        'POST',
        `/tables/${table}/records/list`,
        {
          limit: LIST_PAGE_SIZE,
          with_vector: false,
          filter: { must: [equal('team_id', String(teamId)), within('id', idList.map(String))] },
          ...(cursor ? { cursor } : {})
        }
      );
      owned.push(...(page.records || []).map((record) => String(record.id)));
      cursor = page.next_cursor ?? null;
    } while (cursor);

    await Promise.all(
      owned.map((id) =>
        dxmtRequest('PUT', `/tables/${table}/records/${encodeURIComponent(id)}`, {
          payload: { createtime },
          merge_mode: 'merge'
        })
      )
    );
  };

  delete: VectorControllerType['delete'] = async (props) => {
    const teamWhere = equal('team_id', String(props.teamId));

    const filter: DxmtFilter | undefined = (() => {
      if ('id' in props && props.id) {
        return { must: [teamWhere, within('id', [String(props.id)])] };
      }
      if ('datasetIds' in props && props.datasetIds) {
        const must = [teamWhere, within('dataset_id', props.datasetIds.map(String))];
        if ('collectionIds' in props && props.collectionIds) {
          must.push(within('collection_id', props.collectionIds.map(String)));
        }
        return { must };
      }
      if ('idList' in props && Array.isArray(props.idList)) {
        if (props.idList.length === 0) return;
        return { must: [teamWhere, within('id', props.idList.map(String))] };
      }
    })();

    if (!filter) {
      if ('idList' in props) return;
      return Promise.reject('deleteDatasetData: no where');
    }
    // datasetIds / collectionIds 为空数组时 In [] 不匹配任何记录，与 SQL 的 IN () 语义一致
    await dxmtRequest('DELETE', `/tables/${table}/records`, { filter });
  };

  embRecall: VectorControllerType['embRecall'] = async (props) => {
    const { teamId, datasetIds, vector, limit, forbidCollectionIdList, filterCollectionIdList } =
      props;

    // 与其他向量库一致：filterCollectionIdList 中被禁止的集合也要剔除
    const forbidList = (() => {
      if (!filterCollectionIdList) return forbidCollectionIdList.map(String);
      return forbidCollectionIdList
        .map(String)
        .filter((id) => !filterCollectionIdList.includes(id));
    })();
    const allowList = filterCollectionIdList
      ?.map(String)
      .filter((id) => !forbidCollectionIdList.includes(id));
    if (allowList && allowList.length === 0) {
      return { results: [] };
    }

    const must = [equal('team_id', String(teamId)), within('dataset_id', datasetIds.map(String))];
    if (allowList) must.push(within('collection_id', allowList));
    const filter: DxmtFilter = { must };
    if (forbidList.length > 0) filter.must_not = [within('collection_id', forbidList)];

    const result = await dxmtRequest<{
      hits?: { id: string; score: number; payload?: Record<string, unknown> }[];
    }>('POST', `/tables/${table}/search`, {
      vector,
      top_k: limit,
      filter,
      with_payload: true,
      with_vector: false,
      payload_fields: ['collection_id']
    });

    return {
      results: (result?.hits || []).map((hit) => ({
        id: String(hit.id),
        collectionId: String(hit.payload?.collection_id ?? ''),
        score: hit.score
      }))
    };
  };

  /** 按 createtime 区间分页扫描（cron 清理与 Mongo 不一致的孤儿向量）。 */
  getVectorDataByTime: VectorControllerType['getVectorDataByTime'] = async (start, end) => {
    const filter: DxmtFilter = {
      must: [
        { key: 'createtime', operation: { type: 'GreaterThanOrEqual', value: start.getTime() } },
        { key: 'createtime', operation: { type: 'LessThanOrEqual', value: end.getTime() } }
      ]
    };
    const rows: { id: string; teamId: string; datasetId: string }[] = [];
    let cursor: string | null = null;
    do {
      const page: {
        records?: { id: string; payload?: Record<string, unknown>; payload_json?: string }[];
        next_cursor?: string | null;
      } = await dxmtRequest('POST', `/tables/${table}/records/list`, {
        limit: LIST_PAGE_SIZE,
        with_vector: false,
        filter,
        ...(cursor ? { cursor } : {})
      });
      for (const record of page.records || []) {
        const payload = readPayload(record);
        rows.push({
          id: String(record.id),
          teamId: String(payload.team_id ?? ''),
          datasetId: String(payload.dataset_id ?? '')
        });
      }
      cursor = page.next_cursor ?? null;
    } while (cursor);
    return rows;
  };

  getVectorCount: VectorControllerType['getVectorCount'] = async (props) => {
    const { teamId, datasetId, collectionId } = props;
    const must: DxmtCondition[] = [];
    if (teamId) must.push(equal('team_id', String(teamId)));
    if (datasetId) must.push(equal('dataset_id', String(datasetId)));
    if (collectionId) must.push(equal('collection_id', String(collectionId)));

    const result = await dxmtRequest<{ count: number }>(
      'POST',
      `/tables/${table}/records/count`,
      must.length > 0 ? { filter: { must } } : {}
    );
    return Number(result?.count ?? 0);
  };
}
