import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Blocked } from '../../../support/runtime.mjs';
import { assertDevWorkflowTestTeam } from './workflow-database.mjs';
import { workflowModel } from './workflow-model.mjs';

test('共享 Dev 只允许资源清单及数据库中均匹配本轮标识的团队', () => {
  const id = 'a'.repeat(32);
  const teamId = '507f1f77bcf86cd799439011';
  const fixture = { environment: 'local-dev', teamId, ownedResources: { id, teamIds: [teamId] } };
  const team = { _id: teamId, name: `FG-TEST-${id}` };
  assert.doesNotThrow(() => assertDevWorkflowTestTeam(fixture, team));
  for (const [candidate, target] of [
    [{ ...fixture, environment: 'other' }, team],
    [{ ...fixture, ownedResources: { id: 'dev', teamIds: [teamId] } }, team],
    [{ ...fixture, ownedResources: { id, teamIds: [] } }, team],
    [fixture, { ...team, _id: '507f1f77bcf86cd799439012' }],
    [fixture, { ...team, name: 'FG-TEST-other' }],
    [fixture, undefined]
  ]) {
    assert.throws(() => assertDevWorkflowTestTeam(candidate, target), Blocked);
  }
});

test('共享 Dev 不注册临时系统模型', async () => {
  await assert.rejects(() => workflowModel({}, { fixture: { environment: 'local-dev' } }), Blocked);
});
