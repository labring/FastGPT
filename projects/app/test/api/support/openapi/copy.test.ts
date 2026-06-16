import { describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/support/openapi/copy';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('support/openapi/copy', () => {
  it('记录应用级 APIKey 复制审计且不写入明文密钥', async () => {
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
});
