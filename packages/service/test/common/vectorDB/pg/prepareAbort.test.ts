import { createServer, type Socket } from 'node:net';
import { expect, it, vi } from 'vitest';
import { preparePgFullText } from '@fastgpt/service/common/vectorDB/pg/fullText';

const serverConfig = vi.hoisted(() => ({ port: 0 }));
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({
  PgClient: { query: vi.fn() },
  connectPg: async () => ({
    options: {
      host: '127.0.0.1',
      port: serverConfig.port,
      user: 'fastgpt_test',
      database: 'fastgpt_test',
      ssl: false,
      connectionTimeoutMillis: 5000
    }
  })
}));

it('settles and releases the PG socket when the Runner aborts before the startup response', async () => {
  const controller = new AbortController();
  const reason = new Error('Migration stopped during PostgreSQL handshake');
  let transport: Socket | undefined;
  let transportClosed = false;
  const server = createServer((socket) => {
    transport = socket;
    socket.once('close', () => (transportClosed = true));
    // 收到真实 pg 驱动的 StartupMessage，但故意不返回握手结果。
    socket.once('data', () => controller.abort(reason));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a local TCP port');
    serverConfig.port = address.port;
    let failure: unknown;
    void preparePgFullText({ signal: controller.signal }).catch((error: unknown) => {
      failure = error;
    });
    await expect.poll(() => failure, { timeout: 2000 }).toBe(reason);
    await expect.poll(() => transportClosed, { timeout: 2000 }).toBe(true);
  } finally {
    transport?.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
