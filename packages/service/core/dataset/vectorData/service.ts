import { DatasetVectorDataSchema } from '@fastgpt/global/core/dataset/vectorData/type';
import { vectorRowsUpdateMQService, type VectorRowsUpdateJobData } from './mq';
import { getVectorCount, refreshTeamVectorCount } from '../../../common/vectorDB/controller';
import { findDatasetForVectorRows, updateDatasetVectorRows } from './entity';

/**
 * 一个任务只统计团队或知识库的一个范围。不存在的知识库跳过，计数失败交给 MQ 重试。
 * 每个异步步骤之间检查取消信号，超时后返回的查询结果不再触发后续写回。
 * 本期仅记录局部索引 none，pgIndexCheckedAt 表示该状态的初始化时间，不执行 PG 目录核验。
 */
export const updateVectorRows = async (
  { teamId, datasetId }: VectorRowsUpdateJobData,
  signal?: AbortSignal
) => {
  signal?.throwIfAborted();
  if (datasetId === undefined) {
    await refreshTeamVectorCount(teamId, signal);
    return;
  }

  if (!(await findDatasetForVectorRows({ teamId, datasetId }))) return;
  signal?.throwIfAborted();

  const startedAt = new Date();
  const rows = await getVectorCount({ teamId, datasetId });
  signal?.throwIfAborted();
  const snapshot = DatasetVectorDataSchema.parse({
    rows,
    rowsUpdatedAt: startedAt,
    pgIndex: 'none',
    pgIndexCheckedAt: new Date()
  });
  await updateDatasetVectorRows({ teamId, datasetId, snapshot, signal });
};

/** 应用启动时注册节点内单并发统计消费者；不触发存量扫描或索引构建。 */
export const initVectorRowsUpdateWorker = () =>
  vectorRowsUpdateMQService.getWorker(updateVectorRows);
