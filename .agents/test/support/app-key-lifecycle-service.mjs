import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** 在本轮 dev 团队运行真实 Pro 服务；故障仅限当前事务或本子进程配置。 */
export async function runLifecycleOperation({ input, load, mongo, db }) {
  const oid = (value) => new mongo.Types.ObjectId(value);
  const teamId = input.teamId;
  const { MongoTeamMember } = load('packages/service/support/user/team/teamMemberSchema.ts');
  const member = input.memberId
    ? await MongoTeamMember.findOne({ _id: input.memberId, teamId }).lean()
    : undefined;
  if (input.memberId) assert.ok(member, '成员必须属于本轮团队');
  global.systemConfig = { teamMode: input.action === 'sync' ? 'sync' : 'multi' };
  const controller = load('pro/admin/src/service/support/user/controller.ts');
  const { changeOwner } = load('pro/admin/src/service/core/changeOwner.ts');
  const { mongoSessionRun } = load('packages/service/common/mongo/sessionRun.ts');
  const { withTeamLock } = load('packages/service/support/user/lock.ts');
  /** 快照只含本团队业务归属，不读取凭证明文或混入其他团队。 */
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          ['apps', { teamId: oid(teamId) }, { _id: 1, tmbId: 1, inheritPermission: 1 }],
          [
            'openapis',
            { teamId: oid(teamId) },
            { _id: 1, tmbId: 1, appId: 1, type: 1, limit: 1, usagePoints: 1 }
          ],
          ['team_members', { teamId: oid(teamId) }, { _id: 1, role: 1, status: 1 }],
          [
            'resource_permissions',
            { teamId: oid(teamId) },
            { _id: 1, tmbId: 1, resourceId: 1, permission: 1 }
          ]
        ].map(async ([collection, query, projection]) => [
          collection,
          await db.collection(collection).find(query, { projection }).sort({ _id: 1 }).toArray()
        ])
      )
    );

  if (input.action === 'rollback-after-write') {
    const before = await snapshot();
    let wroteKeys = false;
    await assert.rejects(
      mongoSessionRun(async (session) => {
        const changes = await controller.removeUserFromTeam({
          teamId,
          memberId: input.memberId,
          session
        });
        assert.ok(changes.length > 0, '必须在真实 Key 交接写入后注入故障');
        const key = await db
          .collection('openapis')
          .findOne({ _id: oid(changes[0].keyId) }, { session });
        assert.equal(String(key.tmbId), changes[0].toTmbId);
        wroteKeys = true;
        throw Error('FG_TEST_ROLLBACK_AFTER_KEY_WRITE');
      }),
      /FG_TEST_ROLLBACK_AFTER_KEY_WRITE/
    );
    assert.ok(wroteKeys);
    assert.deepEqual(await snapshot(), before);
    return { action: input.action, wroteKeys, rolledBack: true, before, after: await snapshot() };
  }
  if (input.action === 'sync') {
    const teamMembers = await MongoTeamMember.find({ teamId }).lean();
    const users = await db
      .collection('users')
      .find({ _id: { $in: teamMembers.map((row) => oid(row.userId)) } })
      .toArray();
    const names = new Set(users.map((row) => row.username));
    assert.ok(
      input.latestUserList.length && input.latestUserList.every((row) => names.has(row.username)),
      '同步输入仅限本轮已存在测试用户'
    );
    await controller.syncUser({ teamId, latestUserList: input.latestUserList });
    return {
      action: input.action,
      transferResources: input.transferResources,
      state: await snapshot()
    };
  }
  if (input.action === 'cancel') {
    assert.ok(member);
    const memberships = await MongoTeamMember.find({ userId: member.userId }).lean();
    assert.ok(
      memberships.every((row) => String(row.teamId) === teamId),
      '注销服务不能涉及清单外团队'
    );
    const { cleanupAccountCancellationTeams } = load(
      'pro/admin/src/service/support/user/account/cancellation/finalize/cleanupTeams.ts'
    );
    const { checkAccountCancellationResiduals } = load(
      'pro/admin/src/service/support/user/account/cancellation/finalize/residualCheck.ts'
    );
    const cleanup = await cleanupAccountCancellationTeams(String(member.userId));
    let residual;
    const deadline = Date.now() + 60000;
    do {
      residual = await checkAccountCancellationResiduals(String(member.userId));
      if (residual.complete) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(residual.complete, true, '真实清理队列应收敛至无残留');
    return { action: input.action, cleanup, residual };
  }
  if (input.action === 'create-under-lock') {
    const url = new URL(input.baseUrl);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.ok(member && input.body.type === 'app' && /^FG-TEST-/.test(input.body.name));
    const app = await db
      .collection('apps')
      .findOne({ _id: oid(input.body.appId), teamId: oid(teamId) });
    assert.ok(app && /^FG-TEST-/.test(app.name));
    const state = JSON.parse(await readFile(input.stateFile, 'utf8'));
    const before = await db.collection('openapis').countDocuments({ teamId: oid(teamId) });
    const result = await withTeamLock(teamId, async () => {
      const response = await fetch(input.baseUrl + '/api/support/openapi/create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'fastgpt-web-request': '1',
          Cookie: state.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(30000)
      });
      const json = await response.json();
      assert.notEqual(json.code, 200, '团队锁持有期间不能新建 Key');
      assert.match(
        JSON.stringify(json),
        /lease|lock|占用|操作.*频繁|请求.*频繁/i,
        '必须是实际锁冲突，实际拒绝：' + JSON.stringify(json)
      );
      return {
        http: response.status,
        code: json.code,
        statusText: json.statusText,
        message: json.message
      };
    });
    assert.equal(await db.collection('openapis').countDocuments({ teamId: oid(teamId) }), before);
    return { action: input.action, result, writes: 0 };
  }
  if (input.action === 'race-owner-leave') {
    const app = await db.collection('apps').findOne({ _id: oid(input.appId), teamId: oid(teamId) });
    const receiver = await MongoTeamMember.findOne({
      _id: input.newOwnerId,
      teamId,
      status: 'active'
    }).lean();
    assert.ok(member && app && receiver);
    const remove = () => controller.removeUserFromTeam({ teamId, memberId: input.memberId });
    const transfer = () =>
      changeOwner({
        changeOwnerType: 'app',
        resourceId: input.appId,
        oldOwnerId: String(app.tmbId),
        newOwnerId: input.newOwnerId,
        teamId
      });
    const results = await Promise.allSettled([remove(), transfer()]);
    assert.ok(results.some((row) => row.status === 'fulfilled'));
    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      if (row.status === 'rejected') {
        assert.equal(row.reason.name, 'RedisLeaseUnavailableError', '仅允许实际锁竞争拒绝');
        await (index === 0 ? remove() : transfer());
      }
    }
    const current = await db.collection('apps').findOne({ _id: oid(input.appId) });
    assert.equal(String(current.tmbId), input.newOwnerId);
    const keys = await db
      .collection('openapis')
      .find(
        { teamId: oid(teamId), appId: input.appId, type: 'app' },
        { projection: { _id: 1, tmbId: 1 } }
      )
      .toArray();
    assert.ok(keys.length && keys.every((key) => String(key.tmbId) === input.newOwnerId));
    return {
      action: input.action,
      firstAttempts: results.map((row) => row.status),
      retried: results.filter((row) => row.status === 'rejected').length,
      appId: input.appId,
      owner: input.newOwnerId,
      keys
    };
  }
  throw Error('Unsupported lifecycle action');
}
