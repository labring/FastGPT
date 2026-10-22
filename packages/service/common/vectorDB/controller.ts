/* vector crud */
import { TeamVectorCountCache } from '@fastgpt/dal/redis/caches';
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { OpenGaussVectorCtrl } from './opengauss';
import { getVectors } from '../../core/ai/embedding';
import type { GetVectorsProps } from '../../core/ai/embedding';
import type {
  VectorControllerType,
  InsertVectorControllerPropsType,
  DelDatasetVectorCtrlPropsType,
  VectorRowsChangedCallback
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
const teamVectorCountCache = new TeamVectorCountCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

export const initVectorStore = Vector.init;
export const recallFromVectorStore: VectorControllerType['embRecall'] = (props) =>
  retryFn(() => Vector.embRecall(props));

type DatasetVectorInput = string | GetVectorsProps['inputs'][number];

/**
 * 统一写入知识库索引向量。
 *
 * `inputs` 的 text/image 类型只用于告诉 embedding 模型如何生成向量；
 * 进入向量库时已经统一成 number[][]，向量库本身不区分文本向量或图片向量。
 * 传入 string 时保持旧行为，默认按文本生成 embedding。
 * 写入成功后调用上层业务通知；回调不传入向量适配器，失败隔离由回调实现方负责。
 */
export const insertDatasetDataVector = async ({
  model,
  inputs,
  onVectorRowsChanged,
  ...props
}: Omit<InsertVectorControllerPropsType, 'vectors'> & {
  inputs: DatasetVectorInput[];
  model: EmbeddingModelDataType;
  onVectorRowsChanged: VectorRowsChangedCallback;
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

  await onVectorRowsChanged({ teamId: props.teamId, datasetIds: [props.datasetId] });

  return {
    tokens,
    insertIds
  };
};

/** 按原范围删除向量，成功后调用上层业务通知；统计上下文与回调均不传给向量适配器。 */
export const deleteDatasetDataVector = async ({
  onVectorRowsChanged,
  ...props
}: DelDatasetVectorCtrlPropsType & { onVectorRowsChanged: VectorRowsChangedCallback }) => {
  // 单库上下文只用于统计，物理删除继续使用原来的 id/idList 过滤条件。
  const { datasetIds, deleteProps } = (() => {
    if ('datasetIds' in props) return { datasetIds: props.datasetIds, deleteProps: props };

    const { datasetId, ...deleteProps } = props;
    return { datasetIds: [datasetId], deleteProps };
  })();
  const result = await retryFn(() => Vector.delete(deleteProps));
  await onVectorRowsChanged({ teamId: props.teamId, datasetIds });
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

/** 读取最近成功的团队计数快照；缺失时回源，缓存写入不阻塞请求返回。 */
export const getVectorCountByTeamId = async (teamId: string) => {
  const cacheCount = await teamVectorCountCache.get(teamId);
  if (cacheCount !== undefined) {
    return cacheCount;
  }

  const count = await Vector.getVectorCount({ teamId });
  void teamVectorCountCache.set({ teamId, count });
  return count;
};

/** 发布本轮团队计数；超时取消后不再开始缓存回填，正常变更不废弃统计结果。 */
export const refreshTeamVectorCount = async (teamId: string, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  const count = await Vector.getVectorCount({ teamId });
  signal?.throwIfAborted();
  await teamVectorCountCache.set({ teamId, count });
  return count;
};
export const getVectorCount = Vector.getVectorCount;
