import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/dataset/resumeInheritPermission';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

vi.unmock('@fastgpt/service/support/user/audit/util');

describe('PUT /api/core/dataset/resumeInheritPermission', () => {
  beforeEach(async () => {
    await MongoTeamAudit.deleteMany({});
  });

  it('writes a RESUME_INHERIT_PERMISSION audit after success', async () => {
    const root = await getRootUser();
    const parent = await MongoDataset.create({
      name: 'parent',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'test-model'
    });
    const folder = await MongoDataset.create({
      name: 'folder',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'test-model',
      parentId: parent._id,
      inheritPermission: false
    });

    const res = await Call(handler, {
      auth: root,
      body: { datasetId: String(folder._id) }
    });

    expect(res.code).toBe(200);

    // 该接口的审计在返回前落库，响应成功后应立即可查
    const audit = await MongoTeamAudit.findOne({
      teamId: root.teamId,
      event: AuditEventEnum.RESUME_INHERIT_PERMISSION
    }).lean();
    expect(audit).not.toBeNull();
    expect(audit?.scope).toBe('member');
    expect(audit?.tmbId).toBeDefined();
    expect(audit?.metadata).toMatchObject({
      datasetId: String(folder._id),
      datasetName: 'folder',
      oldPermissionSource: 'self',
      newPermissionSource: 'parent'
    });
  });
});
