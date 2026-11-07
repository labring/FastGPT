import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';

const shouldRunKubernetes =
  process.env.SANDBOX_INTEGRATION === 'true' &&
  process.env.AGENT_SANDBOX_PROVIDER === 'opensandbox' &&
  process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes';

type ResourceRequestCase = {
  name: string;
  cpuFactor?: string;
  memoryFactor?: string;
  runtime?: 'kubernetes' | 'docker';
  resourceLimits?: SandboxCreateSpec['resourceLimits'];
  createConfig?: SandboxCreateSpec;
  expectedLimits?: Record<string, string>;
  expectedRequests?: Record<string, string>;
};

// 贯穿真实 env/profile/adapter/SDK 和 HTTP 序列化，只用本地服务替代远端 Lifecycle API。
// 此处验证发送的请求，不模拟 Kubernetes 调度，也不据此断言真实 Pod 的 QoS。
describe.sequential('OpenSandbox resource requests HTTP integration', () => {
  const createRequests: unknown[] = [];
  let baseUrl: string;
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/v1/sandboxes') {
        req.setEncoding('utf8');
        let body = '';
        for await (const chunk of req) body += chunk;
        createRequests.push(JSON.parse(body));
        res.writeHead(201);
        res.end(JSON.stringify({ id: 'sandbox-1', createdAt: new Date().toISOString() }));
      } else if (
        req.method === 'GET' &&
        req.url?.startsWith('/v1/sandboxes/sandbox-1/endpoints/')
      ) {
        res.end(JSON.stringify({ endpoint: new URL(baseUrl).host }));
      } else {
        res.writeHead(404);
        res.end(
          JSON.stringify({ code: 'NOT_FOUND', message: `Unexpected ${req.method} ${req.url}` })
        );
      }
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ code: 'TEST_SERVER_ERROR', message: String(error) }));
    }
  });

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    createRequests.length = 0;
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const cases: ResourceRequestCase[] = [
    { name: 'omits requests with the default factors' },
    {
      name: 'scales CPU independently and preserves memory',
      cpuFactor: '5',
      expectedRequests: { cpu: '0.4', memory: '4096Mi' }
    },
    {
      name: 'scales memory independently and preserves CPU',
      memoryFactor: '2',
      expectedRequests: { cpu: '2', memory: '2048Mi' }
    },
    {
      name: 'rounds requests from the final overridden limits without disk',
      cpuFactor: '3',
      memoryFactor: '3',
      createConfig: { resourceLimits: { cpuCount: 4, memoryMiB: 8192 } },
      resourceLimits: { cpuCount: 1, memoryMiB: 2048 },
      expectedLimits: { cpu: '1', memory: '2048Mi', disk: '5Gi' },
      expectedRequests: { cpu: '0.333', memory: '682Mi' }
    },
    {
      name: 'clamps requests to 1m CPU and 1Mi memory',
      cpuFactor: '10',
      memoryFactor: '10',
      resourceLimits: { cpuCount: 0.005, memoryMiB: 5 },
      expectedLimits: { cpu: '0.005', memory: '5Mi', disk: '5Gi' },
      expectedRequests: { cpu: '0.001', memory: '1Mi' }
    },
    {
      name: 'preserves an explicit CPU-only request override',
      cpuFactor: '5',
      memoryFactor: '5',
      createConfig: { resourceRequests: { cpuCount: 0.25 } },
      expectedRequests: { cpu: '0.25' }
    },
    {
      name: 'preserves an explicit memory-only request override',
      cpuFactor: '5',
      memoryFactor: '5',
      createConfig: { resourceRequests: { memoryMiB: 512 } },
      expectedRequests: { memory: '512Mi' }
    },
    {
      name: 'omits derived and explicit requests for Docker',
      runtime: 'docker',
      cpuFactor: '10',
      memoryFactor: '10',
      createConfig: { resourceRequests: { cpuCount: 0.25, memoryMiB: 512 } }
    }
  ];

  it.each(cases)('$name', async (testCase) => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', baseUrl);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'integration-api-key');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime:integration');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', testCase.runtime ?? 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', testCase.cpuFactor);
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', testCase.memoryFactor);
    vi.resetModules();
    const { buildRuntimeSandboxAdapter } =
      await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter');
    const adapter = buildRuntimeSandboxAdapter('opensandbox', 'resource-requests-session', {
      resourceLimits: testCase.resourceLimits,
      createConfig: {
        ...testCase.createConfig,
        resourceLimits: { storageSize: '5Gi', ...testCase.createConfig?.resourceLimits },
        // 不启动 execd；保留 SDK 创建与 endpoint HTTP 请求的真实实现。
        skipHealthCheck: true
      }
    });
    try {
      await adapter.create();

      expect(createRequests).toHaveLength(1);
      expect(createRequests[0]).toMatchObject({
        resourceLimits: testCase.expectedLimits ?? { cpu: '2', memory: '4096Mi', disk: '5Gi' }
      });
      if (testCase.expectedRequests) {
        expect(createRequests[0]).toHaveProperty('resourceRequests', testCase.expectedRequests);
      } else {
        expect(createRequests[0]).not.toHaveProperty('resourceRequests');
      }
    } finally {
      await adapter.close();
    }
  });
});

// 真实 Kubernetes 验收只检查 Pod 落地的 requests/limits；取整、覆盖和序列化边界由 HTTP 集成测试覆盖。
describe.skipIf(!shouldRunKubernetes).sequential('OpenSandbox Kubernetes resource requests', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { name: 'default factors', cpuFactor: '1', memoryFactor: '1', cpu: '1', memory: '512Mi' },
    {
      name: 'CPU-only overcommit',
      cpuFactor: '5',
      memoryFactor: '1',
      cpu: '200m',
      memory: '512Mi'
    },
    {
      name: 'memory-only overcommit',
      cpuFactor: '1',
      memoryFactor: '2',
      cpu: '1',
      memory: '256Mi'
    },
    {
      name: 'CPU and memory overcommit',
      cpuFactor: '5',
      memoryFactor: '2',
      cpu: '200m',
      memory: '256Mi'
    }
  ])(
    'applies $name to the actual Pod',
    async ({ cpuFactor, memoryFactor, cpu, memory }) => {
      vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', cpuFactor);
      vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', memoryFactor);
      vi.resetModules();
      const { buildRuntimeSandboxAdapter } =
        await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter');
      const { serviceEnv } = await import('@fastgpt/service/env');
      const sessionId = `overcommit-integration-${randomUUID()}`;
      const adapter = buildRuntimeSandboxAdapter('opensandbox', sessionId, {
        resourceLimits: { cpuCount: 1, memoryMiB: 512 },
        createConfig: {
          // 只验证 provider 资源配置，无需业务工作区或 Volume Manager 持久卷。
          entrypoint: ['tail', '-f', '/dev/null'],
          timeoutSeconds: 300,
          readyTimeoutSeconds: 60,
          healthCheckPollingInterval: 500
        }
      });

      try {
        await adapter.create();

        // Lifecycle API 的普通 getInfo 不返回资源字段，改读诊断接口中的真实 Pod 信息。
        const response = await fetch(
          `${serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL}/v1/sandboxes/${adapter.id}/diagnostics/inspect`,
          {
            headers: { 'OPEN-SANDBOX-API-KEY': serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ?? '' },
            signal: AbortSignal.timeout(10_000)
          }
        );
        expect(response.status).toBe(200);
        const inspect = await response.text();
        expect(inspect).toMatch(/Phase:\s+Running/);
        const resources = inspect.match(
          /Resources:\s*\n\s+sandbox:\s*\n\s+Requests:\s*([^\n]+)\n\s+Limits:\s*([^\n]+)/
        );
        expect(resources, 'Diagnostics must expose the sandbox container resources').not.toBeNull();
        expect(resources?.[1]).toContain(`'cpu': '${cpu}'`);
        expect(resources?.[1]).toContain(`'memory': '${memory}'`);
        expect(resources?.[2]).toContain("'cpu': '1'");
        expect(resources?.[2]).toContain("'memory': '512Mi'");
      } finally {
        // 删除失败要使验收失败；close 即使在清理异常时也必须释放 SDK 连接。
        try {
          await adapter.delete();
        } finally {
          await adapter.close();
        }
      }
    },
    90_000
  );
});
