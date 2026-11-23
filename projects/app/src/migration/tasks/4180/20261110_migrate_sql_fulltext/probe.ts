import { createHash } from 'node:crypto';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { createVectorController } from '@fastgpt/service/common/vectorDB/controller';
import type { NativeFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/type';

/**
 * 在当前索引中用隔离词条验证中英文匹配与集合过滤。使用固定向量，无需模型或业务样本，
 * 空库也能验收。scope 绑定目标、collection 绑定 runId，避免晚到的清理跨运行删除探测行。
 */
export const verifySqlFullTextSearch = async ({
  adapter,
  targetId,
  runId,
  assertActive
}: {
  adapter: NativeFullTextAdapter;
  targetId: string;
  runId: string;
  assertActive: () => Promise<void>;
}) => {
  const probeId = (part: string) =>
    createHash('sha256')
      .update(`fastgpt/sql-fulltext-probe/${targetId}/${part}`)
      .digest('hex')
      .slice(0, 24);
  const teamId = probeId('team');
  const datasetId = probeId('dataset');
  const collectionId = probeId(`${runId}/primary`);
  const excludedCollectionId = probeId(`${runId}/excluded`);
  const vectors = [Array.from({ length: 1536 }, (_, index) => Number(index === 0))];
  const vectorStore = createVectorController();

  // 前次异常退出可能遗留已提交的探测行，下一次验收先清理同一隔离知识库。
  await assertActive();
  await vectorStore.delete({ teamId, datasetIds: [datasetId] });
  try {
    const {
      insertIds: [expectedId]
    } = await vectorStore.insert({
      teamId,
      datasetId,
      collectionId,
      vectors,
      texts: ['数据库索引 constellation']
    });
    const {
      insertIds: [excludedId]
    } = await vectorStore.insert({
      teamId,
      datasetId,
      collectionId: excludedCollectionId,
      vectors,
      texts: ['数据库索引 constellation']
    });
    if (!expectedId || !excludedId)
      throw new Error('SQL full-text probe rows could not be created');

    const scope = { teamId, datasetIds: [datasetId], limit: 10, forbidCollectionIdList: [] };
    // MongoDB Search 异步消费写入。以探测行真正可检索作为验收条件，最多额外等待约 10 秒。
    const retries = adapter.provider === 'mongo' ? 20 : undefined;
    await retryFn(async () => {
      await assertActive();
      const [unfiltered, allowed, filtered] = await Promise.all([
        adapter.search({ ...scope, query: '数据库' }),
        adapter.search({
          ...scope,
          query: 'constellation',
          filterCollectionIdList: [collectionId]
        }),
        adapter.search({
          ...scope,
          query: 'constellation',
          filterCollectionIdList: [collectionId, excludedCollectionId],
          forbidCollectionIdList: [collectionId]
        })
      ]);
      if (
        unfiltered.length !== 2 ||
        !unfiltered.some((hit) => hit.vectorId === expectedId) ||
        !unfiltered.some((hit) => hit.vectorId === excludedId) ||
        allowed.length !== 1 ||
        allowed[0].vectorId !== expectedId ||
        filtered.length !== 1 ||
        filtered[0].vectorId !== excludedId
      )
        throw new Error('SQL full-text smoke test failed to return expected scoped results');
    }, retries);
  } finally {
    await vectorStore.delete({
      teamId,
      datasetIds: [datasetId],
      collectionIds: [collectionId, excludedCollectionId]
    });
  }
};
