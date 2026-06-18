import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/support/openapi/copy';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('support/openapi/copy', () => {
  beforeEach(() => {
    vi.mocked(addAuditLog).mockClear();
    vi.mocked(addAuditLog).mockResolvedValue(undefined);
  });

  it('记录团队级 APIKey 复制审计并返回明文密钥', async () => {
    const user = await getRootUser();
    const openapi = await MongoOpenApi.create({
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
        keyName: 'team key'
      }
    });
    expect(JSON.stringify(vi.mocked(addAuditLog).mock.calls)).not.toContain('fastgpt-team-secret');
  });

  it('记录应用级 APIKey 复制审计并返回明文密钥', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: 'test app',
      type: AppTypeEnum.simple
    });

    const openapi = await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: String(app._id),
      apiKey: 'fastgpt-app-secret',
      name: 'app key'
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
        keyName: 'app key'
      }
    });
    expect(JSON.stringify(vi.mocked(addAuditLog).mock.calls)).not.toContain('fastgpt-app-secret');
  });

  it('审计写入失败时不返回明文密钥', async () => {
    const user = await getRootUser();
    const openapi = await MongoOpenApi.create({
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
});
