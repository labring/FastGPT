import handler from '@/pages/api/core/app/update';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('app update audit resources', () => {
  beforeEach(() => vi.mocked(addAuditLog).mockClear());

  it.each([AppTypeEnum.simple, AppTypeEnum.folder])(
    'keeps baseline metadata for %s',
    async (type) => {
      const { owner } = await getFakeUsers(1);
      const app = await MongoApp.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        type,
        name: 'before'
      });
      const result = await Call(handler, {
        auth: owner,
        query: { appId: String(app._id) },
        body: { name: 'after' }
      });
      expect(result.code).toBe(200);
      expect(addAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEventEnum.UPDATE_APP_INFO,
          params: expect.objectContaining({ appName: 'before', newItemValues: ['after'] }),
          ...(type === AppTypeEnum.folder ? {} : { resources: [{ appId: String(app._id) }] })
        })
      );
      if (type === AppTypeEnum.folder) {
        expect(vi.mocked(addAuditLog).mock.calls[0][0]).not.toHaveProperty('resources');
      }
    }
  );
});
