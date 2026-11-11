import { privateDatabase } from '../../../support/private.mjs';
import { assertIsolatedMongoTarget } from '../../../support/isolated-dependencies.mjs';
import { Blocked } from '../../../support/runtime.mjs';
import { required } from '../../../support/scenario.mjs';

/** 共享 Dev 只接受本轮创建并在资源清单中登记的测试团队。 */
export function assertDevWorkflowTestTeam(fixture, team) {
  const runId = fixture.ownedResources?.id;
  if (
    fixture.environment !== 'local-dev' ||
    !/^[a-f0-9]{32}$/.test(runId ?? '') ||
    !Array.isArray(fixture.ownedResources?.teamIds) ||
    !fixture.ownedResources.teamIds.includes(fixture.teamId) ||
    String(team?._id) !== fixture.teamId ||
    team?.name !== `FG-TEST-${runId}`
  ) {
    throw new Blocked('共享 Dev 工作流测试只允许本轮清单中的 FG-TEST 团队');
  }
}

/** 仅连接本轮登记的 Dev 测试团队，或带归属标记的隔离测试库。 */
export async function workflowDatabase(context, scenario) {
  if (scenario.fixture.environment === 'local-dev') {
    const connection = await privateDatabase(context, scenario);
    const team = await connection.db
      .collection('teams')
      .findOne({ _id: new connection.ObjectId(scenario.fixture.teamId) });
    assertDevWorkflowTestTeam(scenario.fixture, team);
    return connection;
  }

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
