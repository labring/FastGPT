import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiDatasetMockServer } from '@test/mockserver/dataset';

vi.mock('../../../../common/api/axios', async (importOriginal) => {
  const axios = (await import('axios')).default;
  return {
    ...(await importOriginal<object>()),
    createProxyAxios: (config: any) => axios.create(config),
    axiosWithoutSSRF: axios
  };
});

import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';
import {
  buildApiFileTree,
  buildApiFileRecords
} from '@fastgpt/service/core/dataset/apiDataset/tree';
import { serviceEnv } from '@fastgpt/service/env';

describe('API Dataset Mock Server Stress & Load Tests', () => {
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

  it('压力测试 1：本地 Mock Server 高并发请求吞吐量与延迟分布', async () => {
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
    // 4 层结构：4 x 10 x 10 x 100 = 40,000 个文件，444 个目录，总计 40,444 节点
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

    // 1. 递归向 HTTP 真实服务拉取树结构 (445 次真实 HTTP 请求)
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

    // 2. 摊平为 40,444 条待入库记录并完成拓扑排序与派生目录校验
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
