import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../../../..');
const fixturePath = process.env.FASTGPT_TEST_SEARCH_FIXTURE;
const directory = process.env.FASTGPT_TEST_RUN_DIR;
const resultFile = process.env.FASTGPT_TEST_RESULTS_FILE;
const selected = JSON.parse(process.env.FASTGPT_TEST_ITEMS || '[]');
assert.ok(
  fixturePath && directory && resultFile && selected.length,
  'Run through pnpm test:cases with FASTGPT_TEST_SEARCH_FIXTURE'
);
const f = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.ok(
  f.database.startsWith('fg_search_pr8194_') && f.schema.startsWith('fg_search_pr8194_'),
  'An isolated Dev database/schema is required'
);
const require = createRequire(path.join(repo, 'projects/app/package.json'));
const { MongoClient, ObjectId } = require('mongoose').mongo;
const Redis = createRequire(path.join(repo, 'packages/dal/package.json'))('ioredis');
const { Client } = require('pg');
const client = await new MongoClient(f.env.MONGODB_URI).connect();
const db = client.db(f.database);
const logs = client.db(f.logDatabase);
const redis = new Redis(f.env.REDIS_URL);
const pg = new Client({ connectionString: f.env.PG_URL });
await pg.connect();
const owner = f.members.owner;
const member = f.members.member;
const models = f.models;
const records = [];
let observations = [];
const modes = ['embedding', 'fullTextRecall', 'mixedRecall'];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Evidence excludes credentials and transient signed URL query strings. */
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/apiKey|session|authorization|password|secret|requestAuth/i.test(key))
        .map(([key, item]) => [key, redact(item)])
    );
  if (typeof value === 'string' && /^https?:/.test(value)) {
    const url = new URL(value);
    url.search = '';
    return url.href;
  }
  return value;
};
const gateway = async (mode, reset = false) => {
  const response = await fetch(f.gatewayUrl + '/__control', {
    method: 'POST',
    body: JSON.stringify({ mode, reset })
  });
  return response.json();
};
const gatewayState = async () => (await fetch(f.gatewayUrl + '/__control')).json();
/** Use the real HTTP entry; status and business envelope are checked independently. */
async function request(base, route, body, actor = owner, session = false) {
  const response = await fetch(base + '/api/' + route, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(actor
        ? session
          ? { token: actor.session }
          : { authorization: 'Bearer ' + actor.apiKey }
        : {})
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  const text = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw Error(`Non-JSON HTTP response: ${route}, status ${response.status}`);
  }
  const result = { status: response.status, envelope };
  observations.push({ base, route, body: redact(body), ...redact(result) });
  return result;
}
function success(result) {
  assert.equal(result.status, 200, 'Expected HTTP success');
  assert.equal(result.envelope.code, 200, JSON.stringify(redact(result.envelope)));
  return result.envelope.data;
}
function rejected(result) {
  assert.ok(result.status !== 200 || result.envelope.code !== 200, 'Expected a business rejection');
  return result.envelope;
}
const legacy = (options = {}, datasetId = f.datasets.k1) => ({
  datasetId,
  text: f.query,
  queryImageUrls: [],
  searchMode: 'embedding',
  usingReRank: false,
  ...options
});
const modern = (old) => ({
  scope: { datasetIds: [old.datasetId] },
  query: { text: old.text ?? '', imageKeys: old.queryImageUrls ?? [] },
  retrieval: { mode: old.searchMode ?? 'embedding', embeddingWeight: old.embeddingWeight ?? 0.5 },
  rerank: old.usingReRank
    ? {
        enabled: true,
        ...(old.rerankModelId ? { modelId: old.rerankModelId } : {}),
        weight: old.rerankWeight ?? 0.5,
        ...(old.rerankCandidateNum === undefined ? {} : { candidateNum: old.rerankCandidateNum })
      }
    : { enabled: false },
  queryExtension: old.datasetSearchUsingExtensionQuery
    ? {
        enabled: true,
        modelId: old.datasetSearchExtensionModelId ?? models.llm.id,
        background: old.datasetSearchExtensionBg ?? ''
      }
    : { enabled: false },
  result: { maxTokens: Math.min(old.limit ?? 5000, 20000), similarity: old.similarity ?? 0 }
});
/** Ignore elapsed time and access signatures; retain order, contents, scores and effective options. */
function normalize(result) {
  const meta = result.meta ?? result;
  return {
    list: result.list.map((item) => ({
      ...redact(item),
      score: item.score?.map((score) => ({
        ...score,
        value: Math.round(score.value * 1e10) / 1e10
      }))
    })),
    limit: meta.maxTokens ?? meta.limit,
    searchMode: meta.searchMode,
    similarity: meta.similarity,
    usingReRank: meta.usingReRank
  };
}
/** Record a real model execution, then replay only the external response for exact A/B comparison. */
async function parity(body, { includeModern = true, actor = owner, session = false } = {}) {
  await gateway('record', true);
  const before = success(
    await request(f.baselineUrl, 'core/dataset/searchTest', body, actor, session)
  );
  assert.ok(before.list.length, 'Baseline must recall known data');
  await gateway('replay');
  const after = success(await request(f.baseUrl, 'core/dataset/searchTest', body, actor, session));
  assert.deepEqual(normalize(after), normalize(before), 'Legacy search changed after migration');
  assert.equal(
    after.queryExtensionModel,
    before.queryExtensionModel,
    'Legacy extension model changed'
  );
  let unified;
  if (includeModern) {
    unified = success(
      await request(f.baseUrl, 'core/dataset/search', modern(body), actor, session)
    );
    assert.deepEqual(
      normalize(unified),
      normalize(before),
      'Structured single-dataset search differs'
    );
  }
  const state = await gatewayState();
  observations.push({ gatewayComparison: state });
  assert.ok(
    state.calls.every((call) => !call.cacheMiss && call.status === 200),
    'Model call failed or request differs from baseline'
  );
  observations.push({
    comparison: 'exact normalized A/B',
    baseline: normalize(before),
    current: normalize(after),
    gateway: state
  });
  return { before, after, unified, gateway: state };
}
async function saveFixture() {
  await writeFile(fixturePath, JSON.stringify(f, null, 2), { mode: 0o600 });
}
/** Setup is resumable by registered IDs; a failed run never blindly repeats successful inserts. */
async function setup() {
  {
    f.datasets ??= {};
    await saveFixture();
    for (const [key, model] of [
      ['k1', models.embedding],
      ['k2', models.embedding],
      ['k3', models.altEmbedding]
    ]) {
      if (f.datasets[key]) continue;
      f.datasets[key] = success(
        await request(f.baseUrl, 'core/dataset/create', {
          name: f.run + '-' + key,
          type: 'dataset',
          intro: 'Isolated retrieval regression fixture',
          vectorModelId: model.id,
          agentModelId: models.llm.id,
          vlmModelId: models.llm.id
        })
      );
      await saveFixture();
    }
  }
  for (const datasetId of [f.datasets.k1, f.datasets.k2, f.datasets.k3]) {
    await db.collection('dataset_collection_tags_v2').updateOne(
      {
        teamId: new ObjectId(owner.teamId),
        datasetId: new ObjectId(datasetId),
        tag: 'department'
      },
      { $setOnInsert: { tagType: 'string', fromMigration: false } },
      { upsert: true }
    );
  }
  if (!f.datasets.foreign) {
    f.datasets.foreign = success(
      await request(
        f.baseUrl,
        'core/dataset/create',
        {
          name: f.run + '-foreign',
          type: 'dataset',
          intro: 'Foreign test scope',
          vectorModelId: models.embedding.id,
          agentModelId: models.llm.id,
          vlmModelId: models.llm.id
        },
        f.members.foreign
      )
    );
    await saveFixture();
  }
  f.collections ??= {};
  for (const [key, dataset] of [
    ['visible', 'k1'],
    ['hidden', 'k1'],
    ['second', 'k2'],
    ['different', 'k3']
  ]) {
    if (!f.collections[key]) {
      f.collections[key] = success(
        await request(f.baseUrl, 'core/dataset/collection/create', {
          datasetId: f.datasets[dataset],
          name: f.run + '-' + key,
          type: 'virtual',
          tags: [{ tag: 'department', value: key === 'visible' ? 'support' : 'sales' }]
        })
      );
      await saveFixture();
    }
  }
  f.query = 'FastGPT red square knowledge base retrieval permissions';
  f.data ??= [];
  for (let i = f.data.length; i < 16; i++) {
    const collection =
      i < 12 ? (i < 6 ? f.collections.visible : f.collections.hidden) : f.collections.second;
    const result = success(
      await request(f.baseUrl, 'core/dataset/data/insertData', {
        collectionId: collection,
        q: `FastGPT red square knowledge base retrieval permissions case ${i}`,
        a: `Case ${i}: a red square image and FastGPT dataset permissions. ${'Knowledge retrieval uses authorized collections and relevant documents. '.repeat(i + 1)}`
      })
    );
    f.data.push(result.insertId ?? result);
    await saveFixture();
  }
  const data = await db
    .collection('dataset_datas')
    .find({ teamId: new ObjectId(owner.teamId) })
    .toArray();
  assert.equal(data.length, 16);
  assert.ok(
    data.every((row) => row.indexes?.length > 0),
    'All fixture chunks must have real indexes'
  );
  const vectorCount = await pg.query(
    'SELECT count(*)::int AS count FROM modeldata WHERE team_id=$1',
    [owner.teamId]
  );
  assert.ok(vectorCount.rows[0].count >= data.length, 'Missing real PG vectors');
  observations.push({
    fixture: {
      datasetIds: f.datasets,
      collectionIds: f.collections,
      data: data.map(({ _id, datasetId, collectionId, indexes }) => ({
        id: _id,
        datasetId,
        collectionId,
        indexes
      })),
      vectorCount: vectorCount.rows[0].count
    }
  });
  // The normal member may read both datasets, but collection ACL remains a separate scenario.
  for (const datasetId of [f.datasets.k1, f.datasets.k2, f.datasets.k3])
    await db.collection('resource_permissions').updateOne(
      {
        teamId: new ObjectId(owner.teamId),
        tmbId: new ObjectId(member.tmbId),
        resourceType: 'dataset',
        resourceId: new ObjectId(datasetId)
      },
      { $set: { permission: 4 } },
      { upsert: true }
    );
  await gateway('live');
}
const handlers = {
  C1: async () => {
    for (const searchMode of modes) await parity(legacy({ searchMode }));
    return 'All three recall modes have identical ordered results, content, scores and effective options across baseline/legacy/structured HTTP entries';
  },
  C2: async () => {
    for (const options of [
      {},
      { limit: 25000 },
      { limit: 0.5, similarity: -1, embeddingWeight: 1.25 }
    ]) {
      const pair = await parity(legacy(options), { includeModern: options.limit !== 0.5 });
      if (options.limit === 25000) assert.equal(pair.after.limit, 20000);
      if (options.limit === 0.5) assert.equal(pair.after.list.length, 1);
    }
    return 'Legacy defaults, 20000-token cap, fractional budget and historical numeric ranges are unchanged';
  },
  C3: async () => {
    for (const options of [
      { rerankModelId: models.rerank.id, rerankCandidateNum: 10 },
      { rerankModel: models.rerank.name, rerankCandidateNum: 20 },
      { rerankModelId: '000000000000000000000099' },
      { rerankCandidateNum: 9 },
      { rerankCandidateNum: '20' }
    ]) {
      const pair = await parity(legacy({ usingReRank: true, ...options }), {
        includeModern: Boolean(options.rerankModelId === models.rerank.id)
      });
      assert.equal(pair.after.usingReRank, true, 'Rerank must actually execute');
      const call = pair.gateway.calls.find((item) => item.documents !== undefined);
      assert.ok(call && call.documents > 0, 'Missing real rerank documents');
      assert.ok(
        call.documents <=
          (typeof options.rerankCandidateNum === 'number' && options.rerankCandidateNum >= 10
            ? options.rerankCandidateNum
            : 100)
      );
    }
    return 'Rerank executes with unchanged ID/name/fallback behavior and candidate limits, including legacy normalization';
  },
  C4: async () => {
    const body = legacy({
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: models.llm.id,
      datasetSearchExtensionBg: 'FastGPT knowledge base retrieval and a red square illustration.'
    });
    const pair = await parity(body);
    assert.ok(pair.after.queryExtensionModel, 'Query extension did not execute');
    assert.equal(pair.unified.meta.queryExtensionModelId, models.llm.id);
    await gateway('live', true);
    const live = success(await request(f.baseUrl, 'core/dataset/search', modern(body)));
    assert.ok(
      live.list.length && live.meta.queryExtensionModelId,
      'Live query extension must work'
    );
    observations.push({ liveGateway: await gatewayState() });
    return 'Real query extension and exact recorded-response parity both pass; actual extension model is returned';
  },
  C5: async () => {
    assert.ok(f.imageKey, 'Setup must provide an owned PNG object');
    for (const text of ['', f.query]) {
      const pair = await parity(legacy({ text, queryImageUrls: [f.imageKey] }));
      assert.ok(
        pair.gateway.calls.some((call) => /chat\/completions|responses/.test(call.path)),
        'No real image caption LLM execution'
      );
    }
    return 'Image-only and mixed queries preserve results using a real owned S3 object and actual VLM response, replayed for deterministic comparison';
  },
  C6: async () => {
    await gateway('live', true);
    const body = modern(legacy());
    body.scope.datasetIds = [f.datasets.k1, f.datasets.k2];
    const a = success(await request(f.baseUrl, 'core/dataset/search', body));
    assert.deepEqual(new Set(a.list.map((item) => item.datasetId)), new Set(body.scope.datasetIds));
    await gateway('record', true);
    const first = success(await request(f.baseUrl, 'core/dataset/search', body));
    await gateway('replay');
    const duplicate = success(
      await request(f.baseUrl, 'core/dataset/search', {
        ...body,
        scope: { datasetIds: [f.datasets.k1, f.datasets.k1, f.datasets.k2] }
      })
    );
    assert.deepEqual(normalize(first), normalize(duplicate));
    for (const mode of ['embedding', 'mixedRecall']) {
      await gateway('live', true);
      rejected(
        await request(f.baseUrl, 'core/dataset/search', {
          ...body,
          scope: { datasetIds: [f.datasets.k1, f.datasets.k3] },
          retrieval: { mode }
        })
      );
      assert.equal((await gatewayState()).calls.length, 0);
    }
    const text = success(
      await request(f.baseUrl, 'core/dataset/search', {
        ...body,
        scope: { datasetIds: [f.datasets.k1, f.datasets.k3] },
        retrieval: { mode: 'fullTextRecall' }
      })
    );
    assert.ok(text.list.length);
    return 'Joint search covers both authorized datasets; duplicates are neutral; incompatible vector models reject before recall while full-text succeeds';
  },
  C7: async () => {
    const ids = [f.datasets.k1, f.datasets.k2].map((id) => new ObjectId(id));
    await db
      .collection('datasets')
      .updateMany({ _id: { $in: ids } }, { $set: { collectionPermissionEnabled: true } });
    const grant = {
      teamId: new ObjectId(owner.teamId),
      tmbId: new ObjectId(member.tmbId),
      resourceType: 'collection',
      resourceId: new ObjectId(f.collections.visible)
    };
    try {
      await db
        .collection('resource_permissions')
        .updateOne(grant, { $set: { permission: 4 } }, { upsert: true });
      observations.push({
        acl: await db
          .collection('resource_permissions')
          .find({
            teamId: new ObjectId(owner.teamId),
            tmbId: new ObjectId(member.tmbId),
            resourceType: 'collection'
          })
          .toArray(),
        datasetPermissionFlags: await db
          .collection('datasets')
          .find({ _id: { $in: ids } }, { projection: { collectionPermissionEnabled: 1 } })
          .toArray()
      });
      for (const searchMode of modes) {
        const pair = await parity(legacy({ searchMode }), { actor: member });
        assert.ok(pair.after.list.every((item) => item.collectionId === f.collections.visible));
        const body = modern(legacy({ searchMode }));
        body.scope.datasetIds.push(f.datasets.k2);
        await gateway('live', true);
        const joint = success(await request(f.baseUrl, 'core/dataset/search', body, member));
        assert.ok(
          joint.list.length &&
            joint.list.every((item) => item.collectionId === f.collections.visible)
        );
      }
      await db.collection('resource_permissions').deleteOne(grant);
      for (const searchMode of modes) {
        const body = modern(legacy({ searchMode }));
        const empty = success(await request(f.baseUrl, 'core/dataset/search', body, member));
        assert.deepEqual(empty.list, []);
      }
      await gateway('live', true);
      const target = f.datasets.foreign ?? String(new ObjectId());
      for (const denied of [target, '000000000000000000000088'])
        rejected(
          await request(
            f.baseUrl,
            'core/dataset/search',
            { ...modern(legacy()), scope: { datasetIds: [f.datasets.k1, denied] } },
            member
          )
        );
      assert.equal((await gatewayState()).calls.length, 0);
    } finally {
      await db
        .collection('datasets')
        .updateMany({ _id: { $in: ids } }, { $set: { collectionPermissionEnabled: false } });
      await db.collection('resource_permissions').deleteOne(grant);
    }
    return 'Collection ACL is preserved in all three modes; no readable collections stays empty and inaccessible targets reject without model calls';
  },
  C8: async () => {
    const body = modern(legacy());
    for (const filter of [
      { collectionIds: [f.collections.visible] },
      { createTime: { gte: '2000-01-01T00:00:00Z', lte: '2099-01-01T00:00:00Z' } },
      { tags: { and: [{ tag: 'department', op: '$eq', value: 'support' }] } }
    ]) {
      await gateway('live', true);
      const result = success(
        await request(f.baseUrl, 'core/dataset/search', {
          ...body,
          scope: { ...body.scope, filter }
        })
      );
      assert.ok(result.list.length);
      if (!filter.createTime)
        assert.ok(result.list.every((item) => item.collectionId === f.collections.visible));
    }
    const none = success(
      await request(f.baseUrl, 'core/dataset/search', {
        ...body,
        scope: { ...body.scope, filter: { createTime: { gte: '2099-01-01T00:00:00Z' } } }
      })
    );
    assert.deepEqual(none.list, []);
    const grant = {
      teamId: new ObjectId(owner.teamId),
      tmbId: new ObjectId(member.tmbId),
      resourceType: 'collection',
      resourceId: new ObjectId(f.collections.visible)
    };
    await db
      .collection('datasets')
      .updateOne(
        { _id: new ObjectId(f.datasets.k1) },
        { $set: { collectionPermissionEnabled: true } }
      );
    await db
      .collection('resource_permissions')
      .updateOne(grant, { $set: { permission: 4 } }, { upsert: true });
    try {
      const result = success(
        await request(
          f.baseUrl,
          'core/dataset/search',
          { ...body, scope: { ...body.scope, filter: { collectionIds: [f.collections.hidden] } } },
          member
        )
      );
      assert.deepEqual(result.list, []);
    } finally {
      await db
        .collection('datasets')
        .updateOne(
          { _id: new ObjectId(f.datasets.k1) },
          { $set: { collectionPermissionEnabled: false } }
        );
      await db.collection('resource_permissions').deleteOne(grant);
    }
    const license = await db
      .collection('systemconfigs')
      .findOne({ type: 'license' }, { sort: { createTime: -1 } });
    assert.ok(license?.value?.data, 'The isolated Dev configuration must have an active license');
    try {
      await db
        .collection('systemconfigs')
        .updateOne({ _id: license._id }, { $set: { 'value.data.expiredTime': '2000-01-01' } });
      await waitForEdition(false);
      rejected(
        await request(f.baseUrl, 'core/dataset/search', {
          ...body,
          scope: { ...body.scope, filter: { collectionIds: [f.collections.visible] } }
        })
      );
    } finally {
      await db
        .collection('systemconfigs')
        .updateOne({ _id: license._id }, { $set: { value: license.value } });
      await waitForEdition(true);
    }
    return 'Collection/time/tag filters match the expected subset and intersect ACL; empty matches stay empty; unsupported edition explicitly refuses filtering';
  },
  C9: async () => {
    const datasetId = new ObjectId(f.datasets.k1);
    const original = await db.collection('datasets').findOne({ _id: datasetId });
    const rejectAll = async (actor = owner, options = {}) => {
      await gateway('live', true);
      const old = legacy(options);
      const results = [
        await request(f.baselineUrl, 'core/dataset/searchTest', old, actor),
        await request(f.baseUrl, 'core/dataset/searchTest', old, actor),
        await request(f.baseUrl, 'core/dataset/search', modern(old), actor)
      ];
      results.forEach(rejected);
      assert.equal(results[0].envelope.code, results[1].envelope.code);
      assert.equal((await gatewayState()).calls.length, 0, 'Unavailable models must not execute');
    };
    try {
      for (const id of [f.models.disabledEmbeddingId, '000000000000000000000077']) {
        assert.ok(id, 'Provide a disabled embedding fixture model');
        await db
          .collection('datasets')
          .updateOne({ _id: datasetId }, { $set: { vectorModelId: new ObjectId(id) } });
        await rejectAll();
      }
      await db
        .collection('datasets')
        .updateOne({ _id: datasetId }, { $set: { vectorModelId: original.vectorModelId } });
      for (const [modelId, options] of [
        [models.embedding.id, {}],
        [models.rerank.id, { usingReRank: true, rerankModelId: models.rerank.id }],
        [
          models.llm.id,
          { datasetSearchUsingExtensionQuery: true, datasetSearchExtensionModelId: models.llm.id }
        ]
      ]) {
        const acl = {
          teamId: new ObjectId(owner.teamId),
          tmbId: new ObjectId(owner.tmbId),
          resourceType: 'model',
          resourceId: new ObjectId(modelId)
        };
        await db
          .collection('resource_permissions')
          .updateOne(acl, { $set: { permission: 4 } }, { upsert: true });
        await clearMemberCache();
        try {
          await rejectAll(member, options);
        } finally {
          await db.collection('resource_permissions').deleteOne(acl);
          await clearMemberCache();
        }
      }
    } finally {
      await db
        .collection('datasets')
        .updateOne({ _id: datasetId }, { $set: { vectorModelId: original.vectorModelId } });
    }
    return 'Disabled/missing/unauthorized index models and unauthorized auxiliary models reject across all entries before any model use';
  },
  C10: async () => {
    const body = modern(legacy());
    await gateway('live', true);
    rejected(await request(f.baseUrl, 'core/dataset/search', body, null));
    rejected(await request(f.baseUrl, 'core/dataset/search', body, { apiKey: 'invalid' }));
    for (const invalid of [
      { ...body, scope: { datasetIds: [] } },
      { ...body, query: { text: ' ' } },
      { ...body, actor: { isRoot: true } },
      { ...body, result: { maxTokens: '5000' } },
      { ...body, rerank: { enabled: 'true' } },
      { ...body, query: { imageKeys: ['temp/' + f.members.foreign.teamId + '/foreign.png'] } },
      { ...body, query: { imageKeys: ['dataset/' + owner.teamId + '/not-temp.png'] } }
    ]) {
      const error = rejected(await request(f.baseUrl, 'core/dataset/search', invalid));
      if (invalid.query?.imageKeys)
        assert.ok(
          !/[\p{Script=Han}]/u.test(error.message ?? error.statusText ?? ''),
          'Custom exception text must be English'
        );
    }
    assert.equal((await gatewayState()).calls.length, 0);
    return 'Authentication, strict schema and image ownership refusals execute no models; custom ownership errors are English';
  },
  C11: async () => {
    // Drain earlier scenarios' asynchronous billing/track buffers before measuring individual searches.
    await delay(11000);
    const enhanced = legacy({
      usingReRank: true,
      rerankModelId: models.rerank.id,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: models.llm.id
    });
    const groups = [];
    for (const [name, body] of [
      ['ordinary', legacy()],
      ['enhanced', enhanced]
    ]) {
      await gateway('record', true);
      const snapshots = [];
      for (const [base, route, params, session] of [
        [f.baselineUrl, 'core/dataset/searchTest', body, false],
        [f.baseUrl, 'core/dataset/searchTest', body, false],
        [f.baseUrl, 'core/dataset/search', modern(body), false]
      ]) {
        if (snapshots.length) await gateway('replay');
        const prior = await usageSnapshot();
        const beforeObservation = await observationCounts();
        const result = success(await request(base, route, params, owner, session));
        assert.ok(result.list.length);
        const after = await waitForUsage(prior);
        const observationsAfter = await waitForObservation(beforeObservation);
        const delta = after.points - prior.points;
        const usage = after.usages.filter((item) => !prior.ids.includes(String(item._id)));
        assert.equal(usage.length, 1, 'Each positive-token search must produce one usage record');
        assert.ok(
          usage[0].totalPoints > 0,
          'Use a nonzero test model price to verify real accounting'
        );
        assert.equal(usage[0].source, 'api');
        const items = await db.collection('usage_items').find({ usageId: usage[0]._id }).toArray();
        assert.ok(items.length >= (name === 'enhanced' ? 4 : 1));
        assert.ok(
          Math.abs(delta - usage[0].totalPoints) < 1e-6,
          'API key increment must equal billed points'
        );
        snapshots.push({
          delta,
          usage: redact(usage),
          items: redact(items),
          beforeObservation,
          observationsAfter
        });
      }
      // Missing optional outputTokens is semantically zero in the existing billing contract.
      const signature = (item) => ({
        points: Math.round(item.delta * 1e8) / 1e8,
        phases: item.items
          .map((x) => ({
            modelId: x.modelId,
            inputTokens: x.inputTokens ?? 0,
            outputTokens: x.outputTokens ?? 0,
            amount: x.amount
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      });
      assert.deepEqual(
        signature(snapshots[1]),
        signature(snapshots[0]),
        'Legacy billing phases changed'
      );
      assert.deepEqual(
        signature(snapshots[2]),
        signature(snapshots[0]),
        'Structured search bills differently'
      );
      groups.push({ name, snapshots });
    }
    await gateway('live', true);
    const prior = await usageSnapshot();
    const counts = await observationCounts();
    success(await request(f.baseUrl, 'core/dataset/search', modern(legacy()), owner, true));
    const after = await waitForUsage(prior);
    await waitForObservation(counts);
    const usage = after.usages.filter((item) => !prior.ids.includes(String(item._id)));
    assert.equal(usage.length, 1);
    assert.equal(usage[0].source, 'fastgpt');
    assert.equal(after.points, prior.points, 'Login search must not update API key points');
    const refused = await usageSnapshot();
    await gateway('live', true);
    rejected(
      await request(f.baseUrl, 'core/dataset/search', {
        ...modern(legacy()),
        query: { imageKeys: ['temp/foreign/no.png'] }
      })
    );
    const afterRefusal = await usageSnapshot();
    assert.deepEqual(afterRefusal.ids, refused.ids);
    assert.equal(afterRefusal.points, refused.points);
    assert.equal((await gatewayState()).calls.length, 0);
    observations.push({
      billingGroups: groups,
      loginUsage: redact(usage),
      refusalUsageUnchanged: true
    });
    return 'Ordinary and enhanced searches create one nonzero bill, one audit and one search track; phase tokens/points match baseline, API key increments match bills, login identity and refusal accounting are correct';
  },
  C12: async () => {
    const workflowRunner = path.join(import.meta.dirname, 'FG-DATASET-RETRIEVAL-002.runner.mts');
    const outputs = [];
    await gateway('record', true);
    for (const [label, root] of [
      ['baseline', f.baselineRoot],
      ['current', repo]
    ]) {
      if (label === 'current') await gateway('replay');
      const output = path.join(directory, label + '-workflow.json');
      const config = path.join(directory, label + '-workflow-tsconfig.json');
      await writeFile(
        config,
        JSON.stringify({
          extends: path.join(root, 'projects/app/tsconfig.json'),
          compilerOptions: {
            paths: {
              '@/*': [path.join(root, 'projects/app/src/*')],
              '@fastgpt/*': [path.join(root, 'packages/*')],
              '@fastgpt-sdk/otel/logger': [path.join(root, 'sdk/otel/src/logger-entry.ts')],
              '@fastgpt-sdk/otel/metrics': [path.join(root, 'sdk/otel/src/metrics-entry.ts')],
              '@fastgpt-sdk/otel/tracing': [path.join(root, 'sdk/otel/src/tracing-entry.ts')],
              '@fastgpt-sdk/otel': [path.join(root, 'sdk/otel/src/index.ts')],
              '@fastgpt-sdk/storage/access-link': [
                path.join(root, 'sdk/storage/src/access-link/index.ts')
              ],
              '@fastgpt-sdk/storage': [path.join(root, 'sdk/storage/src/index.ts')]
            }
          }
        })
      );
      const run = spawnSync(
        path.join(root, 'projects/app/node_modules/.bin/tsx'),
        ['--tsconfig', config, workflowRunner, fixturePath, root, output],
        {
          cwd: path.join(root, 'projects/app'),
          env: { ...process.env, ...f.env },
          timeout: 120000,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024
        }
      );
      assert.equal(run.status, 0, 'Real workflow integration process failed: ' + label);
      const value = JSON.parse(await readFile(output, 'utf8'));
      assert.ok(!value.error, value.error);
      outputs.push(value);
    }
    assert.deepEqual(outputs[1], outputs[0], 'Workflow dispatcher retrieval changed');
    observations.push({ workflow: outputs, gateway: await gatewayState() });
    return 'Both real workflow dispatchers preserve ordered citations and actual usage, including rerank and metadata filters';
  }
};
/** Invalidate only this run's persisted member-model cache after direct ACL fixture changes. */
async function clearMemberCache() {
  await db
    .collection('tmp_datas')
    .deleteMany({ dataId: { $regex: '^my_models--' + owner.teamId + '--' } });
  const keys = await redis.keys('*' + owner.teamId + '*');
  const selected = keys.filter((key) => /model|permission/i.test(key));
  if (selected.length) await redis.del(...selected);
}
async function waitForEdition(expected) {
  for (let i = 0; i < 60; i++) {
    const response = await fetch(f.baseUrl + '/api/common/system/getInitData', {
      signal: AbortSignal.timeout(120000)
    });
    const envelope = await response.json();
    if (envelope.data?.feConfigs?.isPlus === expected) {
      observations.push({ runtimeEdition: envelope.data.feConfigs.isPlus });
      return;
    }
    await delay(500);
  }
  throw Error('Runtime edition configuration did not reload');
}
async function observationCounts() {
  const rows = await db
    .collection('tracks')
    .find({ event: 'datasetSearch', teamId: owner.teamId, 'data.datasetId': f.datasets.k1 })
    .toArray();
  return {
    tracks: rows.reduce((sum, row) => sum + (row.data?.count ?? 0), 0),
    audits: await logs.collection('operationlogs').countDocuments({
      teamId: new ObjectId(owner.teamId),
      tmbId: new ObjectId(owner.tmbId),
      event: 'SEARCH_TEST'
    })
  };
}
async function waitForObservation(before) {
  for (let i = 0; i < 60; i++) {
    const value = await observationCounts();
    if (value.tracks > before.tracks && value.audits > before.audits) {
      assert.equal(value.tracks - before.tracks, 1, 'Search tracking must occur once');
      assert.equal(value.audits - before.audits, 1, 'Search audit must occur once');
      return value;
    }
    await delay(500);
  }
  throw Error('Audit/search track persistence did not complete within 30 seconds');
}
async function usageSnapshot() {
  const key = await db.collection('openapis').findOne({ apiKey: owner.apiKey });
  const usages = await db
    .collection('usages')
    .find({ teamId: new ObjectId(owner.teamId) })
    .toArray();
  return { points: key.usagePoints, ids: usages.map((row) => String(row._id)), usages };
}
async function waitForUsage(before) {
  for (let i = 0; i < 60; i++) {
    const value = await usageSnapshot();
    if (value.usages.length > before.ids.length) {
      await delay(300);
      return usageSnapshot();
    }
    await delay(500);
  }
  throw Error('Usage persistence did not complete within 30 seconds');
}
try {
  await setup();
  await writeFile(
    path.join(directory, 'fixture.json'),
    JSON.stringify(redact(observations), null, 2)
  );
  for (const id of selected) {
    observations = [];
    const started = new Date().toISOString();
    let result = 'passed',
      note;
    try {
      note = await handlers[id]();
    } catch (error) {
      result = 'failed';
      note = error.message;
    }
    const evidence = id + '-business-observation.json';
    await writeFile(
      path.join(directory, evidence),
      JSON.stringify(
        {
          id,
          started,
          finished: new Date().toISOString(),
          result,
          note,
          observations: redact(observations)
        },
        null,
        2
      )
    );
    records.push({
      caseId: 'FG-DATASET-RETRIEVAL-002',
      itemId: id,
      result,
      note,
      evidence: [{ path: evidence, label: 'Actual HTTP, database and model-gateway observations' }]
    });
    await writeFile(resultFile, JSON.stringify(records, null, 2));
    console.log(id + ': ' + result + ' - ' + note);
  }
} catch (error) {
  const evidence = 'preparation-error.json';
  await writeFile(
    path.join(directory, evidence),
    JSON.stringify({ error: error.message, observations: redact(observations) }, null, 2)
  );
  for (const id of selected)
    records.push({
      caseId: 'FG-DATASET-RETRIEVAL-002',
      itemId: id,
      result: 'blocked',
      note: 'Fixture preparation failed: ' + error.message,
      evidence: [{ path: evidence, label: 'Actual fixture preparation responses' }]
    });
  await writeFile(resultFile, JSON.stringify(records, null, 2));
} finally {
  await pg.end();
  await redis.quit();
  await client.close();
}
if (records.some((record) => record.result !== 'passed')) process.exitCode = 1;
