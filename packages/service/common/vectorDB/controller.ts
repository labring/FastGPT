/* vector crud */
import { TeamVectorCountCache } from '@fastgpt/dal/redis/caches';
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { OpenGaussVectorCtrl } from './opengauss';
import { getVectors } from '../../core/ai/embedding';
import type { GetVectorsProps } from '../../core/ai/embedding';
import type { VectorControllerType, InsertVectorControllerPropsType } from './type';
import { type EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getVectorType } from './constants';
import { MilvusCtrl } from './milvus';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../logger';
import { isRedisLeaseError, LeaseCache } from '@fastgpt/dal/redis/caches/lease';
import { isProVersion } from '../system/constants';
import { vectorRowsUpdateMQService } from '@fastgpt/service/core/dataset/vectorData/mq';

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
const recallLease = new LeaseCache();
// 执行期间每 10 秒续租；释放失败时，额度在最后一次续租后 30 秒过期。
const RECALL_LEASE_TTL_MS = 30_000;
const teamVectorCountCache = new TeamVectorCountCache({
  logger: getLogger(LogCategories.INFRA.REDIS)
});

/** 向量变更成功后通知统计，投递最多等待三秒；故障不能让调用方重试已提交的向量。 */
const notifyVectorRowsChanged = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  // lean 的 Mongo 引用运行时可能仍是 ObjectId，MQ 合同只携带稳定的字符串身份。
  const data = { teamId: String(teamId), datasetIds: datasetIds.map(String) };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      vectorRowsUpdateMQService.pushJobs(data),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Vector rows notification timed out')), 3000);
      })
    ]);
  } catch (error) {
    getLogger(LogCategories.INFRA.QUEUE).error('Failed to queue vector rows update', {
      ...data,
      error
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const initVectorStore = Vector.init;
/**
 * 所有向量库召回共用跨实例并发额度；每次数据库重试都重新获取额度并读取最新配置。
 * 商业版未配置或开源版直接召回；lease 协调错误直接上抛，避免重复排队加重过载。
 */
export const recallFromVectorStore: VectorControllerType['embRecall'] = async (props) => {
  const result = await retryFn(async () => {
    try {
      return {
        success: true as const,
        value: await recallLease.withConcurrency({
          key: 'vector:recall',
          label: 'vector-recall',
          concurrency: () =>
            isProVersion() ? (global.systemEnv?.vectorRecallConcurrency ?? 0) : 0,
          ttlMs: RECALL_LEASE_TTL_MS,
          renewIntervalMs: 10_000,
          fn: () => Vector.embRecall(props)
        })
      };
    } catch (error) {
      if (isRedisLeaseError(error)) return { success: false as const, error };
      throw error;
    }
  });

  if (!result.success) throw result.error;
  return result.value;
};

type DatasetVectorInput = string | GetVectorsProps['inputs'][number];

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

  await teamVectorCountCache.invalidate(props.teamId);
  await notifyVectorRowsChanged({ teamId: props.teamId, datasetIds: [props.datasetId] });

  return {
    tokens,
    insertIds
  };
};

export const deleteDatasetDataVector: VectorControllerType['delete'] = async (props) => {
  const deleteProps = { ...props };
  // datasetId 仅补充统计上下文，不改变适配器原有的删除参数或过滤条件。
  if ('datasetId' in deleteProps) delete deleteProps.datasetId;
  const result = await retryFn(() => Vector.delete(deleteProps));
  await teamVectorCountCache.invalidate(props.teamId);
  const datasetIds =
    'datasetIds' in props ? props.datasetIds : props.datasetId ? [props.datasetId] : [];
  await notifyVectorRowsChanged({ teamId: props.teamId, datasetIds });
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

// Count vector
export const getVectorCountByTeamId = async (teamId: string) => {
  const cacheCount = await teamVectorCountCache.get(teamId);
  if (cacheCount !== undefined) {
    return cacheCount;
  }

  return refreshTeamVectorCount(teamId);
};

/** 后台主动刷新与缓存 miss 共用计数逻辑，始终从实际向量库统计整个团队。 */
export const refreshTeamVectorCount = async (teamId: string) => {
  const revision = await teamVectorCountCache.getRevision(teamId);
  const count = await Vector.getVectorCount({ teamId });

  if (revision)
    void teamVectorCountCache.set({
      teamId,
      count,
      revision
    });

  return count;
};
export const getVectorCount = Vector.getVectorCount;
