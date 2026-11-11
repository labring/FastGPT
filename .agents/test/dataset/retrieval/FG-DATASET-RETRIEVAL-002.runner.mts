import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatasetSearchModeEnum } from '../../../../packages/global/core/dataset/constants';
import type { ChatNodeUsageType } from '../../../../packages/global/support/wallet/bill/type';

type MongoModule = typeof import('../../../../packages/service/common/mongo');
type RedisRuntime = typeof import('../../../../packages/dal/redis/runtime');
const [fixturePath, root, output] = process.argv.slice(2);
const f = JSON.parse(await readFile(fixturePath, 'utf8'));
/** Load each side's real implementation under its own workspace paths; no internal mocks. */
const source = <T,>(relative: string): Promise<T> =>
  import(pathToFileURL(path.join(root, relative)).href);
const serialize = (value: unknown) => JSON.parse(JSON.stringify(value));
let mongo: MongoModule | undefined;
let redisRuntime: RedisRuntime | undefined;
const results = [];
let lastObservation: unknown;
try {
  mongo = await source<MongoModule>('packages/service/common/mongo/index.ts');
  const { connectMongo } = await source<
    typeof import('../../../../packages/service/common/mongo/init')
  >('packages/service/common/mongo/init.ts');
  await connectMongo({ db: mongo.connectionMongo, url: f.env.MONGODB_URI });
  await connectMongo({ db: mongo.connectionLogMongo, url: f.env.MONGODB_LOG_URI });
  redisRuntime = await source<RedisRuntime>('packages/dal/redis/runtime/index.ts');
  redisRuntime.configureRedisRuntime({ redisUrl: f.env.REDIS_URL });
  const { initGlobalVariables, getInitConfig } = await source<
    typeof import('../../../../projects/app/src/service/common/system')
  >('projects/app/src/service/common/system/index.ts');
  initGlobalVariables();
  await getInitConfig();
  const { loadSystemModels, getTeamModelHandle } = await source<
    typeof import('../../../../packages/service/core/ai/model/catalog/service')
  >('packages/service/core/ai/model/catalog/service.ts');
  await loadSystemModels();
  const { initVectorStore } = await source<
    typeof import('../../../../packages/service/common/vectorDB/controller')
  >('packages/service/common/vectorDB/controller.ts');
  await initVectorStore();
  const { dispatchDatasetSearch } = await source<
    typeof import('../../../../packages/service/core/workflow/dispatch/dataset/search')
  >('packages/service/core/workflow/dispatch/dataset/search.ts');
  const { dispatchAgentDatasetSearch } = await source<
    typeof import('../../../../packages/service/core/workflow/dispatch/ai/agent/sub/dataset')
  >('packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts');
  const { createNodeSummary } = await source<
    typeof import('../../../../packages/service/core/workflow/dispatch/utils/summary')
  >('packages/service/core/workflow/dispatch/utils/summary.ts');
  const { countTrackTimer } = await source<
    typeof import('../../../../packages/service/common/middle/tracks/processor')
  >('packages/service/common/middle/tracks/processor.ts');
  const handle = await getTeamModelHandle({ teamId: f.members.owner.teamId });
  const llmModel = handle.getModelData({ modelId: f.models.llm.id }, { type: 'llm' });
  const db = mongo.connectionMongo.connection.db!;
  const count = async () => {
    const values = await db
      .collection('tracks')
      .find({ event: 'datasetSearch', teamId: f.members.owner.teamId })
      .toArray();
    return values.reduce((sum, row) => sum + (row.data?.count ?? 0), 0);
  };
  const dataset = await db
    .collection('datasets')
    .findOne({ _id: new mongo.Types.ObjectId(f.datasets.k1) });
  assert.ok(dataset, 'Fixture dataset must exist');
  const embedding = handle.getModelData({ modelId: f.models.embedding.id }, { type: 'embedding' });
  for (const variant of ['ordinary', 'rerank', 'filter']) {
    const params = {
      datasets: [
        {
          datasetId: f.datasets.k1,
          name: dataset.name,
          avatar: dataset.avatar ?? '',
          vectorModel: { modelId: embedding.modelId, model: embedding.model }
        }
      ],
      userChatInput: f.query,
      similarity: 0,
      limit: 5000,
      searchMode: DatasetSearchModeEnum.mixedRecall,
      embeddingWeight: 0.5,
      usingReRank: variant === 'rerank',
      rerankModelId: f.models.rerank.id,
      rerankCandidateNum: 10,
      rerankWeight: 0.5,
      authTmbId: true,
      datasetSearchUsingExtensionQuery: false,
      ...(variant === 'filter'
        ? { collectionFilterMatch: JSON.stringify({ collectionIds: [f.collections.visible] }) }
        : {})
    };
    for (const kind of ['node', 'agent']) {
      // 独立场景使用稳定的查询标记，避免两次真实 rerank 响应互相覆盖回放记录。
      const query = f.query + ' integration ' + variant + ' ' + kind;
      const scenarioParams = { ...params, userChatInput: query };
      const before = await count();
      const { quotes, nodeResponse, usages } = await (async () => {
        if (kind === 'node') {
          const usages: ChatNodeUsageType[] = [];
          // The standalone service probe supplies only context consumed by this dispatcher.
          const context = {
            runningAppInfo: { teamId: f.members.owner.teamId },
            runningUserInfo: { tmbId: f.members.owner.tmbId, teamId: f.members.owner.teamId },
            externalProvider: {},
            histories: [],
            node: { name: 'Dataset Search' },
            params: scenarioParams,
            nodeSummary: createNodeSummary(),
            usagePush: (items: ChatNodeUsageType[]) => usages.push(...items)
          } as unknown as Parameters<typeof dispatchDatasetSearch>[0];
          const value = await dispatchDatasetSearch(context);
          lastObservation = serialize(value);
          return { quotes: value.data?.quoteQA, nodeResponse: value.responseData, usages };
        }
        const value = await dispatchAgentDatasetSearch({
          args: JSON.stringify({ query: [query] }),
          teamId: f.members.owner.teamId,
          tmbId: f.members.owner.tmbId,
          llmModel,
          datasetParams: scenarioParams
        });
        lastObservation = serialize(value);
        assert.ok(!value.errorMessage, value.errorMessage);
        return {
          quotes: value.nodeResponse?.quoteList,
          nodeResponse: value.nodeResponse,
          usages: value.usages ?? []
        };
      })();
      assert.ok(quotes?.length, 'Real dispatcher must recall fixture chunks');
      if (variant === 'filter')
        assert.ok(quotes.every((item) => String(item.collectionId) === f.collections.visible));
      if (variant === 'rerank')
        assert.ok(nodeResponse?.searchUsingReRank, 'Workflow rerank must actually execute');
      await countTrackTimer();
      assert.equal((await count()) - before, 1, 'Each dispatcher must track one search');
      results.push({
        variant,
        kind,
        quotes: quotes.map((item) => {
          assert.ok(
            'q' in item && 'a' in item,
            'Expected full search chunks from the service dispatcher'
          );
          return {
            id: item.id,
            collectionId: item.collectionId,
            q: item.q,
            a: item.a,
            score: item.score
          };
        }),
        usages: usages.map(({ modelId, inputTokens, outputTokens, totalPoints }) => ({
          modelId,
          inputTokens,
          outputTokens,
          totalPoints
        })),
        trackIncrement: 1
      });
    }
  }
  await writeFile(output, JSON.stringify(serialize(results), null, 2));
} catch (error) {
  await writeFile(
    output,
    JSON.stringify(
      { error: error instanceof Error ? error.message : String(error), results, lastObservation },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await mongo?.connectionMongo?.disconnect();
  await mongo?.connectionLogMongo?.disconnect();
  await globalThis.pgClient?.end();
  await redisRuntime?.closeRedisRuntime();
}
process.exit(process.exitCode ?? 0);
