import type { TestProject } from 'vitest/node';

const DEFAULT_DEV_MONGODB_URI =
  'mongodb://myusername:mypassword@localhost:27017/fastgpt?authSource=admin&directConnection=true';

/** 给 Sandbox 集成测试提供 dev Mongo 连接，具体数据库名仍由测试 Mongo binding 随机隔离。 */
export default async function setup(project: TestProject) {
  project.provide(
    'MONGODB_URI',
    process.env.SANDBOX_INTEGRATION_MONGODB_URI ??
      process.env.MONGODB_URI ??
      DEFAULT_DEV_MONGODB_URI
  );
}
