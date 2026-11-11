import { privateDatabase } from '../../../support/private.mjs';
import { assertIsolatedMongoTarget } from '../../../support/isolated-dependencies.mjs';
import { Blocked } from '../../../support/runtime.mjs';
import { required } from '../../../support/scenario.mjs';

/** 先验证隔离地址与归属标记，再开放本轮工作流测试的数据库连接。 */
export async function workflowDatabase(context, scenario) {
  const environment = required(scenario.fixture.privateEnvironment, 'privateEnvironment');
  const mongoUri = scenario.secret(
    required(scenario.fixture.mongo?.writeUriEnv, 'mongo.writeUriEnv')
  );
  try {
    assertIsolatedMongoTarget({
      mongoUri,
      database: environment.database,
      runId: environment.id
    });
  } catch {
    throw new Blocked('拒绝连接非本轮 Mac Mini 隔离 Mongo 测试库');
  }

  const connection = await privateDatabase(context, scenario);
  const nonce = scenario.secret(required(environment.nonceEnv, 'privateEnvironment.nonceEnv'));
  const marker = await connection.db
    .collection('fg_test_environment')
    .findOne({ _id: environment.id, nonce });
  if (!marker) throw new Blocked('隔离 Mongo 测试库缺少本轮归属标记');
  return connection;
}
