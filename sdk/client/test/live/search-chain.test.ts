import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiveFixture } from './fixture';
import { FastGPTError } from '../../src/error';
import { mongo } from 'mongoose';
import { deflateSync } from 'node:zlib';

let fixture: Awaited<ReturnType<typeof createLiveFixture>>;
let datasetId: string;
let secondId: string;
let readableCollectionId: string;
let hiddenCollectionId: string;
let rerankModel: { _id: mongo.ObjectId; model: string } | undefined;
let llmModel: { _id: mongo.ObjectId; model: string } | undefined;
let visionModel: { _id: mongo.ObjectId; model: string } | undefined;
let imageKey: string | undefined;
const team = () => new mongo.ObjectId(fixture.teamId);
const query = 'Nebula cobalt penguin';

const post = async (path: string, input: unknown) => {
  const response = await fetch(`${fixture.baseURL}/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fixture.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return await response.json();
};

const png = () => {
  const crc32 = (bytes: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: 256 }, () => [20, 80, 210]).flat())
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(256).fill(row)))),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

beforeAll(async () => {
  fixture = await createLiveFixture();
  const models = await fixture.db
    .collection('ai_models')
    .find(
      { scope: 'system', isActive: true },
      { projection: { _id: 1, model: 1, type: 1, 'config.vision': 1 } }
    )
    .toArray();
  rerankModel = models.find((model) => model.type === 'rerank') as typeof rerankModel;
  llmModel = models.find(
    (model) =>
      model.type === 'llm' &&
      model.model === (process.env.FASTGPT_TEST_LLM_MODEL ?? 'deepseek-v4.1-flash')
  ) as typeof llmModel;
  visionModel = models.find(
    (model) =>
      model.type === 'llm' &&
      model.config?.vision &&
      model.model === (process.env.FASTGPT_TEST_VISION_MODEL ?? 'qwen3.8-flash')
  ) as typeof visionModel;
  console.log('Dev model capabilities:', {
    embedding: models.filter((model) => model.type === 'embedding').length,
    rerank: Boolean(rerankModel),
    llm: Boolean(llmModel),
    vision: Boolean(visionModel)
  });
  datasetId = await fixture.client.datasets.create({
    name: 'Search chain dev integration',
    type: 'dataset',
    intro: '',
    ...(visionModel ? { vlmModelId: String(visionModel._id) } : {})
  });
  fixture.datasetIds.push(datasetId);
  secondId = await fixture.client.datasets.create({
    name: 'Second search source',
    type: 'dataset',
    intro: ''
  });
  fixture.datasetIds.push(secondId);
  const first = await fixture.client.datasets.collections.importText({
    datasetId,
    name: 'Readable Nebula fact',
    text: 'Nebula is a cobalt blue penguin. FastGPT CLI integration verifies the Nebula mascot identity.'
  });
  readableCollectionId = first.collectionId;
  const hidden = await fixture.client.datasets.collections.importText({
    datasetId,
    name: 'Hidden Nebula fact',
    text: 'Nebula confidential fact: the cobalt penguin launch code is sapphire.'
  });
  hiddenCollectionId = hidden.collectionId;
  const second = await fixture.client.datasets.collections.importText({
    datasetId: secondId,
    name: 'Other source Nebula fact',
    text: 'Nebula the cobalt penguin supports SDK search integration and knowledge retrieval.'
  });
  for (const id of [readableCollectionId, hiddenCollectionId, second.collectionId])
    await fixture.client.datasets.collections.waitForReady({ id }, { waitTimeoutMs: 150000 });
});

afterAll(async () => {
  try {
    if (imageKey) await fixture.cleanupTemporaryImage(imageKey);
  } finally {
    await fixture?.cleanup();
  }
});

describe('PR dev server complete search chain', () => {
  it.each(['embedding', 'fullTextRecall', 'mixedRecall'] as const)(
    'retrieves both datasets with %s and deduplicates requested dataset IDs',
    async (mode) => {
      const result = await fixture.client.datasets.search({
        scope: { datasetIds: [datasetId, secondId, datasetId] },
        query: { text: query },
        retrieval: { mode }
      });
      expect(result.list.length).toBeGreaterThan(0);
      expect(new Set(result.list.map((item) => item.datasetId))).toEqual(
        new Set([datasetId, secondId])
      );
      expect(new Set(result.list.map((item) => item.id)).size).toBe(result.list.length);
      expect(result.meta.searchMode).toBe(mode);
    }
  );

  it('executes real query extension and reranking with selected authorized model IDs', async () => {
    expect(
      rerankModel,
      'A configured rerank model is required for the dev integration'
    ).toBeDefined();
    expect(llmModel, 'A configured LLM is required for the dev integration').toBeDefined();
    const result = await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId, secondId] },
      query: { text: 'What color and animal is Nebula?' },
      retrieval: { mode: 'mixedRecall' },
      rerank: { enabled: true, modelId: String(rerankModel!._id) },
      queryExtension: {
        enabled: true,
        modelId: String(llmModel!._id),
        background: 'Nebula is the mascot described by these documents.'
      }
    });
    expect(result.list.length).toBeGreaterThan(0);
    expect(result.meta.usingReRank).toBe(true);
    expect(result.meta.queryExtensionModelId).toBe(String(llmModel!._id));
  });

  it('keeps new and legacy single-dataset recall results and budget semantics consistent', async () => {
    const current = await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId] },
      query: { text: query },
      result: { maxTokens: 5000, similarity: 0 }
    });
    const legacy = await fixture.client.datasets.searchTest({
      datasetId,
      text: query,
      limit: 5000,
      similarity: 0
    });
    expect(legacy.list.map((item) => item.id)).toEqual(current.list.map((item) => item.id));
    expect(legacy).toMatchObject({
      limit: 5000,
      searchMode: current.meta.searchMode,
      usingReRank: current.meta.usingReRank
    });
    const historical = await fixture.client.datasets.searchTest({
      datasetId,
      text: query,
      limit: 0.5,
      similarity: -1,
      embeddingWeight: 1.25
    });
    expect(historical.limit).toBe(0.5);
    expect(historical.similarity).toBe(-1);
    await expect(
      fixture.client.datasets.search({
        scope: { datasetIds: [datasetId] },
        query: { text: query },
        result: { maxTokens: 0.5 }
      })
    ).rejects.toBeInstanceOf(FastGPTError);
  });

  it('supports legacy model names for extensions and reranking', async () => {
    expect(llmModel).toBeDefined();
    expect(rerankModel).toBeDefined();
    const result = await fixture.client.datasets.searchTest({
      datasetId,
      text: query,
      usingReRank: true,
      rerankModel: rerankModel!.model,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: llmModel!.model,
      limit: 30000
    });
    expect(result.queryExtensionModel).toBe(llmModel!.model);
    expect(result.usingReRank).toBe(true);
    expect(result.limit).toBe(20000);
  });

  it('intersects structured collection filters with the requested dataset scope', async () => {
    const result = await fixture.client.datasets.search({
      scope: {
        datasetIds: [datasetId, secondId],
        filter: {
          collectionIds: [readableCollectionId],
          createTime: { gte: '2026-01-01T00:00:00Z' }
        }
      },
      query: { text: query }
    });
    expect(result.list.length).toBeGreaterThan(0);
    expect(result.list.every((item) => item.collectionId === readableCollectionId)).toBe(true);
  });

  it('rejects foreign image keys and forged actor fields before execution', async () => {
    await expect(
      fixture.client.datasets.search({
        scope: { datasetIds: [datasetId] },
        query: { imageKeys: ['temp/other-team/foreign.png'] }
      })
    ).rejects.toBeInstanceOf(FastGPTError);
    const response = await post('core/dataset/search', {
      scope: { datasetIds: [datasetId] },
      query: { text: query },
      actor: { isRoot: true, teamId: 'other-team' }
    });
    expect(response.code).not.toBe(200);
  });

  it('uploads an actual search image and exercises image-only and mixed queries', async () => {
    expect(
      visionModel,
      'A configured vision model is required for image search integration'
    ).toBeDefined();
    const bytes = png();
    const signed = await post('core/dataset/file/presignSearchTestImage', {
      datasetId,
      filename: 'dev-blue-square.png',
      size: bytes.length
    });
    expect(signed.code).toBe(200);
    expect(signed.data.uploadMode).toBe('single');
    imageKey = signed.data.key;
    const uploaded = await fetch(signed.data.url, {
      method: 'PUT',
      headers: signed.data.headers,
      body: bytes
    });
    expect(uploaded.ok).toBe(true);
    const image = await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId] },
      query: { imageKeys: [imageKey!] }
    });
    expect(image.list.length).toBeGreaterThan(0);
    const mixed = await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId] },
      query: { text: 'blue penguin', imageKeys: [imageKey!] },
      rerank: { enabled: true, modelId: String(rerankModel!._id) }
    });
    expect(mixed.list.length).toBeGreaterThan(0);
  });

  it('filters collection ACLs and rejects a partially unauthorized multi-dataset request', async () => {
    const member = await fixture.createMember();
    await fixture.db.collection('resource_permissions').insertMany([
      {
        teamId: team(),
        tmbId: new mongo.ObjectId(member.tmbId),
        resourceType: 'dataset',
        resourceId: new mongo.ObjectId(datasetId),
        permission: 4
      },
      {
        teamId: team(),
        tmbId: new mongo.ObjectId(member.tmbId),
        resourceType: 'collection',
        resourceId: new mongo.ObjectId(readableCollectionId),
        permission: 4
      }
    ]);
    await fixture.db
      .collection('datasets')
      .updateOne(
        { _id: new mongo.ObjectId(datasetId), teamId: team() },
        { $set: { collectionPermissionEnabled: true } }
      );
    const result = await member.client.datasets.search({
      scope: { datasetIds: [datasetId] },
      query: { text: query }
    });
    expect(result.list.length).toBeGreaterThan(0);
    expect(result.list.every((item) => item.collectionId === readableCollectionId)).toBe(true);
    await expect(
      member.client.datasets.search({
        scope: { datasetIds: [datasetId, secondId] },
        query: { text: query }
      })
    ).rejects.toBeInstanceOf(FastGPTError);
    await fixture.db
      .collection('datasets')
      .updateOne(
        { _id: new mongo.ObjectId(datasetId), teamId: team() },
        { $set: { collectionPermissionEnabled: false } }
      );
  });

  it('persists one usage record for each successful billable search and no record for a rejected search', async () => {
    const filter = { teamId: team(), appName: 'Knowledge search' };
    const before = await fixture.db.collection('usages').countDocuments(filter);
    await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId] },
      query: { text: query }
    });
    expect(await fixture.db.collection('usages').countDocuments(filter)).toBe(before + 1);
    await expect(
      fixture.client.datasets.search({
        scope: { datasetIds: [datasetId] },
        query: { imageKeys: ['temp/foreign/no.png'] }
      })
    ).rejects.toBeInstanceOf(FastGPTError);
    expect(await fixture.db.collection('usages').countDocuments(filter)).toBe(before + 1);
  });
});
