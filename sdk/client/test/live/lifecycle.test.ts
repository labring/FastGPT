import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { createLiveFixture } from './fixture';
import { FastGPT } from '../../src/client';
import { mongo } from 'mongoose';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
let fixture: Awaited<ReturnType<typeof createLiveFixture>>;
let datasetId: string;
let secondId: string;
let collectionId: string;

beforeAll(async () => {
  fixture = await createLiveFixture();
});
afterAll(async () => {
  await fixture?.cleanup();
});

describe('real FastGPT with API Key authentication', () => {
  it('rejects an invalid API Key and creates an isolated dataset through the SDK', async () => {
    await expect(
      new FastGPT({ baseURL: fixture.baseURL, apiKey: 'invalid-key' }).datasets.list()
    ).rejects.toMatchObject({ details: { kind: 'api' } });
    expect((await fixture.client.datasets.list()).list).toEqual([]);
    datasetId = await fixture.client.datasets.create({
      name: 'SDK API Key E2E',
      type: 'dataset',
      intro: 'Temporary SDK integration data'
    });
    fixture.datasetIds.push(datasetId);
    secondId = await fixture.client.datasets.create({
      name: 'SDK second knowledge base',
      type: 'dataset',
      intro: ''
    });
    fixture.datasetIds.push(secondId);
    expect(datasetId).toMatch(/^[a-f0-9]{24}$/);
    expect((await fixture.client.datasets.get({ id: datasetId })).name).toBe('SDK API Key E2E');
    expect((await fixture.client.datasets.list({ datasetIds: [datasetId] })).list[0].name).toBe(
      'SDK API Key E2E'
    );
  });

  it('imports text, waits for processing and retrieves the expected content across two datasets', async () => {
    const imported = await fixture.client.datasets.collections.importText({
      datasetId,
      name: 'sdk-e2e-fact',
      text: 'FastGPT SDK verification: the project mascot is a cobalt penguin named Nebula.'
    });
    collectionId = imported.collectionId;
    expect(collectionId).toMatch(/^[a-f0-9]{24}$/);
    await fixture.client.datasets.collections.waitForReady(
      { id: collectionId },
      { waitTimeoutMs: 150000, pollIntervalMs: 1000 }
    );
    const chunks = await fixture.client.datasets.chunks.list({ collectionId });
    expect(chunks.list.length).toBeGreaterThan(0);
    const result = await fixture.client.datasets.search({
      scope: { datasetIds: [datasetId, secondId] },
      query: { text: 'cobalt penguin Nebula' },
      retrieval: { mode: 'mixedRecall' }
    });
    expect(
      result.list.some(
        (item) => item.datasetId === datasetId && `${item.q} ${item.a}`.includes('Nebula')
      )
    ).toBe(true);
    expect(result.meta).toMatchObject({ searchMode: 'mixedRecall', maxTokens: 5000 });
    const legacy = await fixture.client.datasets.searchTest({
      datasetId,
      text: 'Nebula',
      limit: 30000
    });
    expect(legacy.limit).toBe(20000);
    expect(legacy.list.length).toBeGreaterThan(0);
  });

  it('runs the built CLI against the same service using only API Key authentication', async () => {
    const binary = resolve(import.meta.dirname, '../../../../packages/cli/dist/cli.js');
    const { stdout, stderr } = await exec(
      process.execPath,
      [binary, 'dataset', 'list', '--page-size', '10'],
      {
        env: { ...process.env, FASTGPT_BASE_URL: fixture.baseURL, FASTGPT_API_KEY: fixture.apiKey },
        timeout: 120000
      }
    );
    expect(stderr).toBe('');
    expect(JSON.parse(stdout).list.map((item: { _id: string }) => item._id)).toContain(datasetId);
    const search = await exec(
      process.execPath,
      [
        binary,
        'dataset',
        'search',
        '--dataset-id',
        datasetId,
        '--dataset-id',
        secondId,
        '--text',
        'Nebula',
        '--mode',
        'mixedRecall'
      ],
      {
        env: { ...process.env, FASTGPT_BASE_URL: fixture.baseURL, FASTGPT_API_KEY: fixture.apiKey },
        timeout: 120000
      }
    );
    expect(JSON.parse(search.stdout).list.length).toBeGreaterThan(0);
  });

  it('uploads Unicode filenames through the SDK and built CLI, waits, and downloads a collection archive', async () => {
    const imported = await fixture.client.datasets.collections.importFile(
      { datasetId },
      {
        filename: '中文手册.txt',
        file: new Blob(['The SDK file verification color is cobalt blue.'])
      }
    );
    await fixture.client.datasets.collections.waitForReady(
      { id: imported.collectionId },
      { waitTimeoutMs: 150000 }
    );
    expect(
      (await fixture.client.datasets.collections.get({ id: imported.collectionId })).name
    ).toBe('中文手册.txt');
    const dir = await mkdtemp(join(tmpdir(), 'fastgpt-sdk-live-'));
    try {
      await writeFile(
        join(dir, 'CLI手册.txt'),
        'CLI upload verification: Nebula is a cobalt penguin.'
      );
      const binary = resolve(import.meta.dirname, '../../../../packages/cli/dist/cli.js');
      const env = {
        ...process.env,
        FASTGPT_BASE_URL: fixture.baseURL,
        FASTGPT_API_KEY: fixture.apiKey
      };
      const uploaded = await exec(
        process.execPath,
        [
          binary,
          'dataset',
          'collection',
          'upload',
          '--dataset-id',
          datasetId,
          '--file',
          join(dir, 'CLI手册.txt'),
          '--wait',
          '--wait-timeout',
          '150000'
        ],
        { env, timeout: 180000 }
      );
      expect(JSON.parse(uploaded.stdout)).toHaveProperty('training.indexAmount');
      const archiveTicket = await fixture.client.datasets.collections.downloadTicket({
        datasetId,
        // 单次申请同时归档 SDK 和 CLI 上传的文件，遵守成员级下载频率限制。
        collectionIds: [imported.collectionId, JSON.parse(uploaded.stdout).collectionId]
      });
      await exec(
        process.execPath,
        [
          binary,
          'dataset',
          'collection',
          'download',
          '--ticket',
          archiveTicket.ticket,
          '--output',
          join(dir, 'backup.zip')
        ],
        { env, timeout: 120000 }
      );
      expect([...(await readFile(join(dir, 'backup.zip'))).subarray(0, 2)]).toEqual([80, 75]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('maintains chunks through public collection and data APIs', async () => {
    const manual = await fixture.client.datasets.collections.create({
      datasetId,
      name: 'SDK manual collection',
      type: 'virtual'
    });
    await fixture.client.datasets.collections.update({
      id: manual,
      name: 'SDK updated collection'
    });
    expect((await fixture.client.datasets.collections.get({ id: manual })).name).toBe(
      'SDK updated collection'
    );
    const pushed = await fixture.client.datasets.chunks.push({
      collectionId: manual,
      data: [{ q: 'What is the SDK test mascot?', a: 'A penguin named Nebula.' }]
    });
    expect(pushed.insertLen).toBe(1);
    const dataId = pushed.dataIds[0];
    await fixture.client.datasets.collections.waitForReady(
      { id: manual },
      { waitTimeoutMs: 150000 }
    );
    expect((await fixture.client.datasets.chunks.get({ id: dataId })).q).toContain('mascot');
    const updated = await fixture.client.datasets.chunks.update({
      dataId,
      q: 'SDK mascot identity',
      a: 'Nebula the penguin'
    });
    expect(updated.q).toBe('SDK mascot identity');
    await fixture.client.datasets.chunks.delete({ id: dataId });
    expect(
      (await fixture.client.datasets.chunks.list({ collectionId: manual })).list.every(
        (item) => item._id !== dataId
      )
    ).toBe(true);
  });

  it('rejects access from an ordinary member without resource permission', async () => {
    const { client } = await fixture.createMember();
    await expect(client.datasets.get({ id: datasetId })).rejects.toMatchObject({
      details: { kind: 'api' }
    });
    await expect(
      client.datasets.search({
        scope: { datasetIds: [datasetId, secondId] },
        query: { text: 'Nebula' }
      })
    ).rejects.toMatchObject({ details: { kind: 'api' } });
    await expect(client.datasets.collections.get({ id: collectionId })).rejects.toMatchObject({
      details: { kind: 'api' }
    });
    await expect(
      client.datasets.collections.update({ id: collectionId, name: 'unauthorized' })
    ).rejects.toMatchObject({ details: { kind: 'api' } });
  });

  it('records search API consumption without duplicating billing', async () => {
    const teamId = new mongo.ObjectId(fixture.teamId);
    const bills = await fixture.db
      .collection('usages')
      .find({ teamId, appName: 'Knowledge search' })
      .toArray();
    expect(bills.length).toBeGreaterThan(0);
    const key = await fixture.db.collection('openapis').findOne({ apiKey: fixture.apiKey });
    expect(key?.usagePoints).toBeGreaterThanOrEqual(0);
  });
});
