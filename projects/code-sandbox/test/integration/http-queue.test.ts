import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serve, type ServerType } from '@hono/node-server';
import { app, poolReady } from '../../src/index';
import { env } from '../../src/env';

type RunWindow = {
  label: string;
  startedAt: number;
  finishedAt: number;
};

type SandboxResponse = {
  success: boolean;
  data?: {
    codeReturn: RunWindow;
    log: string;
  };
  message?: string;
};

const delayCode = `
async function main(v) {
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, v.delayMs));
  return {
    label: v.label,
    startedAt,
    finishedAt: Date.now()
  };
}
`;

function hasOverlap(a: RunWindow, b: RunWindow) {
  return a.startedAt < b.finishedAt && b.startedAt < a.finishedAt;
}

function closeServer(server: ServerType) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

describe('HTTP queueId integration', () => {
  let server: ServerType | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    await poolReady;

    const info = await new Promise<{ port: number }>((resolve) => {
      server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (address) => {
        resolve({ port: address.port });
      });
    });
    baseUrl = `http://127.0.0.1:${info.port}`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  async function runJs({
    label,
    queueId,
    delayMs = 300
  }: {
    label: string;
    queueId?: string;
    delayMs?: number;
  }) {
    const res = await fetch(`${baseUrl}/sandbox/js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.SANDBOX_TOKEN ? { Authorization: `Bearer ${env.SANDBOX_TOKEN}` } : {})
      },
      body: JSON.stringify({
        code: delayCode,
        variables: { label, delayMs },
        queueId
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SandboxResponse;
    expect(body.success).toBe(true);
    expect(body.data?.codeReturn.label).toBe(label);
    return body.data!.codeReturn;
  }

  it('同一 queueId 的真实 HTTP 请求会串行进入执行流程', async () => {
    const queueId = `same-${Date.now()}`;
    const [first, second] = await Promise.all([
      runJs({ label: 'first', queueId }),
      runJs({ label: 'second', queueId })
    ]);

    expect(hasOverlap(first, second)).toBe(false);
  });

  it('不同 queueId 的真实 HTTP 请求可以并行执行', async () => {
    const [first, second] = await Promise.all([
      runJs({ label: 'queue-a', queueId: `queue-a-${Date.now()}` }),
      runJs({ label: 'queue-b', queueId: `queue-b-${Date.now()}` })
    ]);

    expect(hasOverlap(first, second)).toBe(true);
  });

  it('未传 queueId 的真实 HTTP 请求不受 queueId 并发限制', async () => {
    const [first, second] = await Promise.all([
      runJs({ label: 'no-queue-a' }),
      runJs({ label: 'no-queue-b' })
    ]);

    expect(hasOverlap(first, second)).toBe(true);
  });
});
