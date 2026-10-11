import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiDatasetMockServer } from '@test/mockserver/dataset';

vi.mock('../../../../common/api/axios', async (importOriginal) => {
  const axios = (await import('axios')).default;
  return {
    ...(await importOriginal<object>()),
    createProxyAxios: (config: any) => axios.create(config),
    axiosWithoutSSRF: axios
  };
});

vi.mock('@fastgpt/dal/redis/caches', () => ({
  DingtalkAccessTokenCache: class {
    async getOrRefresh({ fetchToken }: any) {
      const res = await fetchToken();
      return res.accessToken;
    }
  }
}));

import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';
import { useFeishuDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/feishuDataset/api';
import { useDingtalkDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/dingtalkDataset/api';
import { useYuqueDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/yuqueDataset/api';
import {
  buildApiFileTree,
  buildApiFileRecords
} from '@fastgpt/service/core/dataset/apiDataset/tree';
import { serviceEnv } from '@fastgpt/service/env';

describe('API Dataset Mock Server: 协议集成与压测套件', () => {
  const mockServer = new ApiDatasetMockServer();

  beforeAll(async () => {
    const { baseUrl } = await mockServer.start();
    serviceEnv.FEISHU_BASE_URL = baseUrl;
    serviceEnv.DINGTALK_BASE_URL = baseUrl;
    serviceEnv.DINGTALK_OAPI_BASE_URL = baseUrl;
    serviceEnv.YUQUE_BASE_URL = baseUrl;
    serviceEnv.YUQUE_DATASET_BASE_URL = baseUrl;
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.initDefaultData();
  });

  describe('1. 外部知识库 Provider 协议通信与异常防护', () => {
    describe('1.1 自定义 API 知识库真实通信', () => {
      it('通过 HTTP 真实接口列举目录与文件，递归拉取整树', async () => {
        const request = useApiDatasetRequest({
          apiServer: {
            baseUrl: mockServer.baseUrl,
            authorization: 'test-token'
          }
        });

        const rootFiles = await request.listFiles({ parentId: 'root' });
        expect(rootFiles).toHaveLength(2);
        expect(rootFiles.find((f) => f.id === 'fld-1')).toMatchObject({
          type: 'folder',
          hasChild: true
        });
        expect(rootFiles.find((f) => f.id === 'doc-root')).toMatchObject({
          type: 'file',
          hasChild: false
        });

        const childFiles = await request.listFiles({ parentId: 'fld-1' });
        expect(childFiles).toHaveLength(1);
        expect(childFiles[0]).toMatchObject({ id: 'doc-child', type: 'file' });

        const detail = await request.getFileDetail({ apiFileId: 'fld-1' });
        expect(detail).toMatchObject({ id: 'fld-1', type: 'folder', hasChild: true });

        const content = await request.getFileContent({
          apiFileId: 'doc-child',
          datasetId: 'd1',
          teamId: 't1',
          tmbId: 'tmb1'
        });
        expect(content).toMatchObject({
          title: 'Custom Doc Title',
          rawText: 'Custom Doc Full Content'
        });
      });
    });

    describe('1.2 飞书 Drive / Docx 适配器与异常防护 (I01)', () => {
      const feishuServer = {
        appId: 'cli_test',
        appSecret: 'secret_test',
        folderToken: 'fld-root'
      };

      it('正常场景：分别正确探测 docx 与 folder 元数据', async () => {
        const request = useFeishuDatasetRequest({ feishuServer });

        const folderDetail = await request.getFileDetail({ apiFileId: 'fld-sub' });
        expect(folderDetail).toMatchObject({
          id: 'fld-sub',
          name: 'Feishu Sub Folder',
          type: 'folder',
          hasChild: true
        });

        const docDetail = await request.getFileDetail({ apiFileId: 'doc-1' });
        expect(docDetail).toMatchObject({
          id: 'doc-1',
          name: 'Feishu Doc 1',
          type: 'file',
          hasChild: false
        });
      });

      it('真正删除场景：远端 token 不存在时返回文件不存在', async () => {
        mockServer.feishuNotFoundTokens.add('gone-token');
        const request = useFeishuDatasetRequest({ feishuServer });

        await expect(request.getFileDetail({ apiFileId: 'gone-token' })).rejects.toBe('文件不存在');
      });

      it('I01 关键保护：飞书遇到 503 异常时抛错中止，绝不被误判为文件不存在', async () => {
        mockServer.feishu503 = true;
        const request = useFeishuDatasetRequest({ feishuServer });

        await expect(request.getFileDetail({ apiFileId: 'fld-root' })).rejects.toMatchObject({
          status: 503
        });
      });

      it('I01 关键保护：飞书遇到 429 限流时抛错中止，绝不被误判为文件不存在', async () => {
        mockServer.feishu429 = true;
        const request = useFeishuDatasetRequest({ feishuServer });

        await expect(request.getFileDetail({ apiFileId: 'fld-root' })).rejects.toMatchObject({
          status: 429
        });
      });
    });

    describe('1.3 钉钉知识库有子节点的在线文档 (I15)', () => {
      const dingtalkServer = {
        appKey: 'ding_key',
        appSecret: 'ding_secret',
        userId: 'user_123',
        rootNodeId: 'root-node'
      };

      it('I15 关键保护：带子节点的 wiki_doc 保留为 file 且 hasChild: true', async () => {
        const request = useDingtalkDatasetRequest({ dingtalkServer });

        const nodes = await request.listFiles({ parentId: 'root-node' });
        const onlineDocWithChildren = nodes.find((n) => n.id === 'doc-with-children');
        expect(onlineDocWithChildren).toBeDefined();
        expect(onlineDocWithChildren!.type).toBe('file');
        expect(onlineDocWithChildren!.hasChild).toBe(true);

        const subNodes = await request.listFiles({ parentId: 'doc-with-children' });
        expect(subNodes).toHaveLength(1);
        expect(subNodes[0]).toMatchObject({
          id: 'sub-doc',
          type: 'file',
          hasChild: false
        });
      });

      it('带子节点的文档通过 tree 模块派生目录并保留正文文件', async () => {
        const request = useDingtalkDatasetRequest({ dingtalkServer });
        const treeNodes = await buildApiFileTree({
          request,
          seeds: [
            {
              id: 'doc-with-children',
              name: 'Online Doc With Children',
              type: 'file',
              hasChild: true
            }
          ]
        });

        const records = buildApiFileRecords(treeNodes);
        const dirRecord = records.find((r) => r.apiFileId === 'doc-with-children#dir');
        const fileRecord = records.find((r) => r.apiFileId === 'doc-with-children');
        const subDocRecord = records.find((r) => r.apiFileId === 'sub-doc');

        expect(dirRecord).toBeDefined();
        expect(dirRecord!.type).toBe('folder');

        expect(fileRecord).toBeDefined();
        expect(fileRecord!.type).toBe('file');
        expect(fileRecord!.parentDirId).toBe('doc-with-children#dir');

        expect(subDocRecord).toBeDefined();
        expect(subDocRecord!.type).toBe('file');
        expect(subDocRecord!.parentDirId).toBe('doc-with-children#dir');
      });
    });

    describe('1.4 语雀知识库契约一致性与 TOC 缓存 (I04, I11)', () => {
      const yuqueServer = {
        token: 'yuque_token',
        userId: 'group_100'
      };

      it('I04 关键保护：知识库根 getFileDetail 返回 string ID 且 type 始终为 folder', async () => {
        const request = useYuqueDatasetRequest({ yuqueServer });

        const repoList = await request.listFiles({});
        expect(repoList).toHaveLength(1);
        expect(repoList[0]).toMatchObject({
          id: '1001',
          type: 'folder',
          hasChild: true
        });

        const repoDetail = await request.getFileDetail({ apiFileId: '1001' });
        expect(repoDetail.id).toBe('1001');
        expect(repoDetail.rawId).toBe('1001');
        expect(repoDetail.type).toBe('folder');
        expect(repoDetail.hasChild).toBe(true);
      });

      it('I11 关键保护：同一实例多次读取同一知识库子目录时复用 TOC 缓存', async () => {
        const request = useYuqueDatasetRequest({ yuqueServer });

        await request.listFiles({ parentId: '1001' });
        const callsAfterFirst = mockServer.yuqueTocCalls;
        expect(callsAfterFirst).toBe(1);

        await request.listFiles({ parentId: '1001-u-fld1-u-doc1' });
        expect(mockServer.yuqueTocCalls).toBe(1);
      });
    });
  });

  describe('2. 高并发吞吐、网络延迟与大规模树（40,000 文件）压测', () => {
    it('压力测试 1：本地 Mock Server 高并发请求吞吐量与延迟分布 (1,000 请求 / 50 并发)', async () => {
      const totalRequests = 1000;
      const concurrency = 50;
      const request = useApiDatasetRequest({
        apiServer: {
          baseUrl: mockServer.baseUrl,
          authorization: 'stress-token'
        }
      });

      const latencies: number[] = [];
      const startAll = Date.now();

      for (let i = 0; i < totalRequests; i += concurrency) {
        const batch = Array.from({ length: Math.min(concurrency, totalRequests - i) });
        await Promise.all(
          batch.map(async () => {
            const t0 = Date.now();
            await request.listFiles({ parentId: 'root' });
            latencies.push(Date.now() - t0);
          })
        );
      }

      const totalWallMs = Date.now() - startAll;
      latencies.sort((a, b) => a - b);

      const qps = Number(((totalRequests / totalWallMs) * 1000).toFixed(2));
      const p50 = latencies[Math.floor(totalRequests * 0.5)];
      const p95 = latencies[Math.floor(totalRequests * 0.95)];
      const p99 = latencies[Math.floor(totalRequests * 0.99)];
      const avg = Number((latencies.reduce((a, b) => a + b, 0) / totalRequests).toFixed(2));

      console.log('[STRESS-1 HTTP Throughput]', {
        totalRequests,
        concurrency,
        totalWallMs: `${totalWallMs} ms`,
        qps,
        avgLatency: `${avg} ms`,
        p50: `${p50} ms`,
        p95: `${p95} ms`,
        p99: `${p99} ms`
      });

      expect(latencies).toHaveLength(totalRequests);
      expect(qps).toBeGreaterThan(100);
    }, 30000);

    it('压力测试 2：2,230 节点大规模 4 层树遍历与记录平铺转换', async () => {
      const shape = { l1: 5, l2: 5, l3: 8, filesPerLeaf: 10 };
      const { folders, files } = mockServer.generateCustomTree(shape);
      const totalNodes = folders + files;

      const request = useApiDatasetRequest({
        apiServer: {
          baseUrl: mockServer.baseUrl,
          authorization: 'stress-token'
        }
      });

      const initialMemory = process.memoryUsage().heapUsed;
      const t0 = Date.now();

      const treeNodes = await buildApiFileTree({
        request,
        seeds: [
          {
            id: 'root',
            name: 'ROOT',
            type: 'folder',
            hasChild: true
          }
        ]
      });
      const treeDurationMs = Date.now() - t0;

      const t1 = Date.now();
      const records = buildApiFileRecords(treeNodes);
      const recordsDurationMs = Date.now() - t1;

      const finalMemory = process.memoryUsage().heapUsed;
      const heapDiffMB = Number(((finalMemory - initialMemory) / (1024 * 1024)).toFixed(2));
      const totalWallMs = Date.now() - t0;

      console.log('[STRESS-2 Tree Scale Performance]', {
        folders,
        files,
        totalNodes: records.length,
        treeTraversalMs: `${treeDurationMs} ms`,
        recordsFlattenMs: `${recordsDurationMs} ms`,
        totalWallMs: `${totalWallMs} ms`,
        throughput: `${Number(((totalNodes / totalWallMs) * 1000).toFixed(1))} nodes/sec`,
        heapDiffMB: `${heapDiffMB} MB`
      });

      expect(records.length).toBeGreaterThanOrEqual(totalNodes);
      expect(records.filter((r) => r.type === 'file')).toHaveLength(files);
      expect(recordsDurationMs).toBeLessThan(100);
    }, 60000);

    it('压力测试 3：注入 15ms 真实网络往返延迟下的有界并发与容错压测', async () => {
      mockServer.delayMs = 15;
      const totalRoots = 100;

      const request = useApiDatasetRequest({
        apiServer: {
          baseUrl: mockServer.baseUrl,
          authorization: 'stress-token'
        }
      });

      const t0 = Date.now();
      const batchSize = 10;
      let completed = 0;
      for (let i = 0; i < totalRoots; i += batchSize) {
        const chunk = Array.from({ length: Math.min(batchSize, totalRoots - i) });
        await Promise.all(
          chunk.map(async () => {
            await request.listFiles({ parentId: 'root' });
            completed++;
          })
        );
      }
      const wallMs = Date.now() - t0;

      console.log('[STRESS-3 Network Latency + Bounded Concurrency]', {
        totalRoots,
        simulatedLatencyPerReq: '15 ms',
        batchSize,
        completed,
        totalWallMs: `${wallMs} ms`,
        theoreticalMinMs: `${(totalRoots / batchSize) * 15} ms`
      });

      expect(completed).toBe(totalRoots);
      expect(wallMs).toBeGreaterThan(150);
      expect(wallMs).toBeLessThan(5000);

      mockServer.delayMs = 0;
    }, 30000);

    it('压力测试 4：40,000 个文件大规模 4 层树真实 HTTP 遍历与全量平铺转换', async () => {
      const shape = { l1: 4, l2: 10, l3: 10, filesPerLeaf: 100 };
      const { folders, files } = mockServer.generateCustomTree(shape);
      const totalNodes = folders + files;

      const request = useApiDatasetRequest({
        apiServer: {
          baseUrl: mockServer.baseUrl,
          authorization: 'stress-40k-token'
        }
      });

      const initialMemory = process.memoryUsage().heapUsed;
      const t0 = Date.now();

      const treeNodes = await buildApiFileTree({
        request,
        seeds: [
          {
            id: 'root',
            name: 'ROOT',
            type: 'folder',
            hasChild: true
          }
        ]
      });
      const treeDurationMs = Date.now() - t0;

      const t1 = Date.now();
      const records = buildApiFileRecords(treeNodes);
      const recordsDurationMs = Date.now() - t1;

      const finalMemory = process.memoryUsage().heapUsed;
      const heapDiffMB = Number(((finalMemory - initialMemory) / (1024 * 1024)).toFixed(2));
      const totalWallMs = Date.now() - t0;

      console.log('[STRESS-4 40K Files Full Scale]', {
        folders,
        files,
        totalNodes: records.length,
        httpCalls: 445,
        treeTraversalMs: `${treeDurationMs} ms`,
        recordsFlattenMs: `${recordsDurationMs} ms`,
        totalWallMs: `${totalWallMs} ms`,
        throughput: `${Number(((totalNodes / totalWallMs) * 1000).toFixed(1))} nodes/sec`,
        heapDiffMB: `${heapDiffMB} MB`
      });

      expect(records.length).toBeGreaterThanOrEqual(totalNodes);
      expect(records.filter((r) => r.type === 'file')).toHaveLength(40000);
    }, 120000);
  });
});
