import { afterEach, describe, expect, it, vi } from 'vitest';
import mongooseExport from '@fastgpt/service/common/mongo';
import {
  createResilientChangeStream,
  type ChangeStreamEvent,
  type ResilientChangeStream
} from '@fastgpt/service/common/mongo/watch';

type Connection = ReturnType<typeof mongooseExport.createConnection>;

const connections: Connection[] = [];
const handles: ResilientChangeStream[] = [];

const openConnection = async (options: Record<string, unknown> = {}) => {
  const connection = mongooseExport.createConnection(process.env.MONGODB_URI as string, options);
  await connection.asPromise();
  connections.push(connection);
  return connection;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  for (const handle of handles.splice(0)) {
    await handle.close().catch(() => undefined);
  }
  for (const connection of connections.splice(0)) {
    await connection.close().catch(() => undefined);
  }
});

describe('change stream 韧性（真实驱动 + 真实 mongod）', () => {
  it('对照：只订阅 change 的原始 watch 在集合 drop 后永久静默', async () => {
    const connection = await openConnection();
    const collectionName = `watch_control_${Date.now()}`;
    const received: string[] = [];

    // 修复前的写法：只订阅 change，不处理 error / close / invalidate。
    const stream = connection.db.collection(collectionName).watch();
    stream.on('change', (change) => {
      received.push(String(change.operationType));
    });

    await connection.db.collection(collectionName).insertOne({ before: 'drop' });
    await vi.waitFor(() => expect(received).toContain('insert'), { timeout: 5000 });

    // drop 触发 invalidate 并结束游标，之后没有任何错误也没有任何事件。
    await connection.db.dropCollection(collectionName);
    await sleep(1500);

    await connection.db.collection(collectionName).insertOne({ after: 'drop' });
    await sleep(1500);

    expect(received.filter((item) => item === 'insert')).toHaveLength(1);
  }, 60000);

  it('集合被 drop（invalidate）后自动重建游标并继续收到事件', async () => {
    const connection = await openConnection();
    const collectionName = `watch_invalidate_${Date.now()}`;
    const received: string[] = [];
    handles.push(
      createResilientChangeStream<ChangeStreamEvent>({
        name: 'integration-invalidate',
        initialRetryDelayMs: 200,
        maxRetryDelayMs: 400,
        createStream: () => connection.db.collection(collectionName).watch(),
        onChange: (change) => {
          received.push(String(change.operationType));
        }
      })
    );

    await connection.db.collection(collectionName).insertOne({ before: 'drop' });
    await vi.waitFor(() => expect(received).toContain('insert'), { timeout: 5000 });

    await connection.db.dropCollection(collectionName);
    await sleep(1500);

    await connection.db.collection(collectionName).insertOne({ after: 'drop' });
    await vi.waitFor(() => expect(received.filter((item) => item === 'insert')).toHaveLength(2), {
      timeout: 8000
    });
  }, 60000);

  it('重连后触发一次 onResume，用于补偿断线期间丢失的变更', async () => {
    const connection = await openConnection();
    const collectionName = `watch_resume_${Date.now()}`;
    let resumes = 0;
    let changes = 0;

    handles.push(
      createResilientChangeStream<ChangeStreamEvent>({
        name: 'integration-resume',
        initialRetryDelayMs: 200,
        createStream: () => connection.db.collection(collectionName).watch(),
        onChange: () => {
          changes += 1;
        },
        onResume: () => {
          resumes += 1;
        }
      })
    );

    await connection.db.collection(collectionName).insertOne({ seed: 1 });
    await vi.waitFor(() => expect(changes).toBeGreaterThan(0), { timeout: 5000 });
    // 首次建流不做补偿：启动阶段由初始化流程负责。
    expect(resumes).toBe(0);

    await connection.db.dropCollection(collectionName);
    await vi.waitFor(() => expect(resumes).toBe(1), { timeout: 8000 });

    await connection.db.collection(collectionName).insertOne({ after: 'resume' });
    await vi.waitFor(() => expect(changes).toBeGreaterThan(1), { timeout: 8000 });
  }, 60000);

  it('close() 后不再重连，也不再接收事件', async () => {
    const connection = await openConnection();
    const collectionName = `watch_close_${Date.now()}`;
    let changes = 0;

    const handle = createResilientChangeStream<ChangeStreamEvent>({
      name: 'integration-close',
      initialRetryDelayMs: 200,
      createStream: () => connection.db.collection(collectionName).watch(),
      onChange: () => {
        changes += 1;
      }
    });

    await connection.db.collection(collectionName).insertOne({ seed: 1 });
    await vi.waitFor(() => expect(changes).toBeGreaterThan(0), { timeout: 5000 });

    await handle.close();
    const changesAtClose = changes;
    await connection.db.collection(collectionName).insertOne({ after: 'close' });
    await sleep(1500);

    expect(changes).toBe(changesAtClose);
  }, 60000);

  it('客户端关闭（终止性错误）不再抛未捕获异常，且 close() 可正常停止', async () => {
    const connection = await openConnection();
    const collectionName = `watch_client_${Date.now()}`;
    let changes = 0;

    const uncaught: string[] = [];
    const onUncaught = (error: unknown) => {
      uncaught.push(error instanceof Error ? error.name : String(error));
    };
    process.on('uncaughtException', onUncaught);

    try {
      const handle = createResilientChangeStream<ChangeStreamEvent>({
        name: 'integration-client-closed',
        initialRetryDelayMs: 100,
        maxRetryDelayMs: 200,
        createStream: () => connection.db.collection(collectionName).watch(),
        onChange: () => {
          changes += 1;
        }
      });
      handles.push(handle);

      await connection.db.collection(collectionName).insertOne({ seed: 1 });
      await vi.waitFor(() => expect(changes).toBeGreaterThan(0), { timeout: 5000 });

      // 驱动这里会发出 MongoClientClosedError；没有 error 监听时它会变成未捕获异常。
      await connection.close();
      await sleep(1200);

      expect(uncaught).toEqual([]);

      await handle.close();
    } finally {
      process.off('uncaughtException', onUncaught);
    }
  }, 60000);
});
