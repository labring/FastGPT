import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/support/openapi/copy';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('support/openapi/copy', () => {
  beforeEach(() => {
    vi.mocked(addAuditLog).mockClear();
    vi.mocked(addAuditLog).mockResolvedValue(undefined);
  });

  it('记录团队级 APIKey 复制审计并返回明文密钥', async () => {
    const user = await getRootUser();
    const openapi = await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-team-secret',
      name: 'team key'
    });

    const auth = {
      ...user,
      userId: String(user.userId),
      teamId: String(user.teamId),
      tmbId: String(user.tmbId)
    };

    const result = await Call(handler, {
      auth,
      body: {
        id: String(openapi._id)
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toBe('fastgpt-team-secret');
    expect(addAuditLog).toHaveBeenCalledWith({
      tmbId: auth.tmbId,
      teamId: auth.teamId,
      event: AuditEventEnum.COPY_API_KEY,
      params: {
        keyName: 'team key',
        keyId: String(openapi._id),
        keyType: 'personal'
      }
    });
    expect(JSON.stringify(vi.mocked(addAuditLog).mock.calls)).not.toContain('fastgpt-team-secret');
  });

  it.each([
    { label: '历史默认应用个人密钥', type: undefined, expectedType: 'personal' },
    { label: '迁移后默认应用个人密钥', type: ApiKeyTypeEnum.personal, expectedType: 'personal' },
    { label: '显式应用密钥', type: ApiKeyTypeEnum.app, expectedType: 'app' }
  ])('$label 复制审计使用实际授权类型并返回明文密钥', async ({ type, expectedType }) => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'test app',
      type: AppTypeEnum.simple
    });

    // 原始集合覆盖旧版缺少 type 且 appId 为字符串的记录，不能由新 Schema 预先转换。
    const openapi = new MongoOpenApi({
      ...(type === undefined ? {} : { type }),
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-app-secret',
      name: 'app key'
    });
    await MongoOpenApi.collection.insertOne({
      ...openapi.toObject({ getters: false }),
      ...(type === undefined ? { appId: String(app._id) } : {})
    });

    const auth = {
      ...user,
      userId: String(user.userId),
      teamId: String(user.teamId),
      tmbId: String(user.tmbId)
    };

    const result = await Call(handler, {
      auth,
      body: {
        id: String(openapi._id)
      }
    });

    expect(result.code).toBe(200);
    expect(result.data).toBe('fastgpt-app-secret');
    expect(addAuditLog).toHaveBeenCalledWith({
      tmbId: auth.tmbId,
      teamId: auth.teamId,
      event: AuditEventEnum.COPY_API_KEY,
      params: {
        keyName: 'app key',
        keyId: String(openapi._id),
        keyType: expectedType,
        ...(expectedType === 'app' ? { appId: String(app._id) } : {})
      }
    });
    expect(JSON.stringify(vi.mocked(addAuditLog).mock.calls)).not.toContain('fastgpt-app-secret');
  });

  it('审计写入失败时不返回明文密钥', async () => {
    const user = await getRootUser();
    const openapi = await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-audit-failed-secret',
      name: 'audit failed key'
    });

    vi.mocked(addAuditLog).mockRejectedValueOnce(new Error('audit failed'));

    const result = await Call(handler, {
      auth: {
        ...user,
        userId: String(user.userId),
        teamId: String(user.teamId),
        tmbId: String(user.tmbId)
      },
      body: {
        id: String(openapi._id)
      }
    });

    expect(result.code).toBe(500);
    expect(result.data).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('fastgpt-audit-failed-secret');
  });

  it('不能复制同团队其他成员的 APIKey', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;
    const openapi = await MongoOpenApi.create({
      type: ApiKeyTypeEnum.personal,
      teamId: member.teamId,
      tmbId: member.tmbId,
      apiKey: 'fastgpt-member-private-secret',
      name: 'member private key'
    });

    const result = await Call(handler, {
      auth: {
        ...owner,
        userId: String(owner.userId),
        teamId: String(owner.teamId),
        tmbId: String(owner.tmbId)
      },
      body: {
        id: String(openapi._id)
      }
    });

    expect(result.code).toBe(500);
    expect(result.data).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('fastgpt-member-private-secret');
    expect(addAuditLog).not.toHaveBeenCalled();
  });
});
