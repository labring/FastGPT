/* vector crud */
import { VectorCountCache, type VectorCountScope } from '@fastgpt/dal/redis/caches/vectorCount';
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { OpenGaussVectorCtrl } from './opengauss';
import { getVectors } from '../../core/ai/embedding';
import type { GetVectorsProps } from '../../core/ai/embedding';
import type {
  VectorControllerType,
  InsertVectorControllerPropsType,
  DelDatasetVectorCtrlPropsType
} from './type';
import { type EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getVectorType } from './constants';
import { MilvusCtrl } from './milvus';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../logger';

const getVectorObj = (): VectorControllerType => {
  switch (getVectorType()) {
    case 'seekdb':
      return new SeekVectorCtrl({ type: 'seekdb' });
    case 'oceanbase':
      return new ObVectorCtrl({ type: 'oceanbase' });
    case 'milvus':
      return new MilvusCtrl();
    case 'opengauss':
      return new OpenGaussVectorCtrl();
    case 'pg':
    default:
      return new PgVectorCtrl();
  }
};

const Vector = getVectorObj();
const vectorCountCache = new VectorCountCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

export const initVectorStore = Vector.init;
export const recallFromVectorStore: VectorControllerType['embRecall'] = (props) =>
  retryFn(() => Vector.embRecall(props));

type DatasetVectorInput = string | GetVectorsProps['inputs'][number];

/** 增删成功后同时清除团队及受影响知识库的计数，知识库上下文不参与物理删除过滤。 */
const invalidateVectorCounts = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  await Promise.all([
    vectorCountCache.invalidate({ teamId: String(teamId) }),
    ...[...new Set(datasetIds.map(String))].map((datasetId) =>
      vectorCountCache.invalidate({ teamId: String(teamId), datasetId })
    )
  ]);
};

/**
 * 统一写入知识库索引向量。
 *
 * `inputs` 的 text/image 类型只用于告诉 embedding 模型如何生成向量；
 * 进入向量库时已经统一成 number[][]，向量库本身不区分文本向量或图片向量。
 * 传入 string 时保持旧行为，默认按文本生成 embedding。
 */
export const insertDatasetDataVector = async ({
  model,
  inputs,
  ...props
}: Omit<InsertVectorControllerPropsType, 'vectors'> & {
  inputs: DatasetVectorInput[];
  model: EmbeddingModelDataType;
}) => {
  if (inputs.length === 0) {
    return {
      tokens: 0,
      insertIds: []
    };
  }

  const embeddingInputs = inputs.map((input) =>
    typeof input === 'string'
      ? {
          type: 'text' as const,
          input
        }
      : input
  );
  const { vectors, tokens } = await getVectors({
    model,
    inputs: embeddingInputs,
    type: 'db'
  });
  const { insertIds } = await retryFn(() =>
    Vector.insert({
      ...props,
      vectors
    })
  );

  await invalidateVectorCounts({ teamId: props.teamId, datasetIds: [props.datasetId] });

  return {
    tokens,
    insertIds
  };
};

/** 删除成功后失效相关计数；单库上下文只用于缓存，不改变按 id/idList 删除的实际范围。 */
export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlPropsType) => {
  const { datasetIds, deleteProps } = (() => {
    if ('datasetIds' in props) return { datasetIds: props.datasetIds, deleteProps: props };
    const { datasetId, ...deleteProps } = props;
    return { datasetIds: [datasetId], deleteProps };
  })();
  const result = await retryFn(() => Vector.delete(deleteProps));
  await invalidateVectorCounts({ teamId: props.teamId, datasetIds });
  return result;
};

/** 替换前分批刷新旧向量时间；任一批重试耗尽则中止，调用方不能继续生成或提交新索引。 */
export const refreshDatasetDataVectorCreateTime: VectorControllerType['refreshCreateTime'] =
  async ({ teamId, idList }) => {
    const ids = [...new Set(idList)];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      await retryFn(() => Vector.refreshCreateTime({ teamId, idList: batch }));
    }
  };

export const getVectorDataByTime = Vector.getVectorDataByTime;

/** 缓存命中直接返回；未命中时查询向量库，异步回填 Redis，不持久化到 Mongo。 */
const getCachedVectorCount = async (scope: VectorCountScope) => {
  const cacheCount = await vectorCountCache.get(scope);
  if (cacheCount !== undefined) {
    return cacheCount;
  }

  const count = await Vector.getVectorCount(scope);
  void vectorCountCache.set({ ...scope, count });
  return count;
};

/** 团队总数沿用原有缓存优先策略。 */
export const getVectorCountByTeamId = (teamId: string) =>
  getCachedVectorCount({ teamId: String(teamId) });

/** 团队及知识库总数共用缓存；集合级和全局统计仍直接查询，避免误用更大范围的数量。 */
export const getVectorCount: VectorControllerType['getVectorCount'] = (props) => {
  if (!props.teamId || props.collectionId) return Vector.getVectorCount(props);
  return getCachedVectorCount({
    teamId: String(props.teamId),
    ...(props.datasetId ? { datasetId: String(props.datasetId) } : {})
  });
};
