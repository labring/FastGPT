import type { TestProject } from 'vitest/node';

/**
 * 优先使用环境变量 MONGODB_TEST_URI 指定的 MongoDB 实例（用于 CI/CD 或本地开发环境）。
 * 若未配置，则尝试使用 mongodb-memory-server（需要能下载 MongoDB 二进制包）。
 *
 * 本地开发环境示例（Docker 内的 MongoDB，副本集成员 hostname 需可解析）：
 *   MONGODB_TEST_URI=mongodb://myusername:mypassword@127.0.0.1:57017/?authSource=admin&replicaSet=rs0
 *
 * 前提：/etc/hosts 中需要有 "127.0.0.1 mongo"，使副本集成员 "mongo:27017" 可从宿主机解析。
 *
 * 注意：test/mocks/common/mongo.ts 中的 connectMongo mock 会自动为每个测试生成 randomUUID()
 * 作为数据库名，因此这里只需提供合法的连接串，无需在 URI 中指定 dbName。
 */
export default async function setup(project: TestProject) {
  const baseUri = process.env.MONGODB_TEST_URI;

  if (baseUri) {
    // 直接使用提供的 URI，mock 层会处理独立数据库隔离
    project.provide('MONGODB_URI', baseUri);
    return async () => {};
  }

  // Fallback：使用 mongodb-memory-server（需要网络下载二进制包）
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  project.provide('MONGODB_URI', uri);

  return async () => {
    await replset.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    MONGODB_URI: string;
  }
}
