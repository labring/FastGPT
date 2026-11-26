import handler from '@/pages/api/core/app/update';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { AuditResourceTypeEnum } from '@fastgpt/global/support/user/audit/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('app update audit resources', () => {
  beforeEach(() => vi.mocked(addAuditLog).mockClear());

  it.each([...AppTypeList, ...ToolTypeList, AppTypeEnum.folder, AppTypeEnum.toolFolder])(
    'records structured resource snapshot and baseline metadata for %s',
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
      const expectedResourceType =
        type === AppTypeEnum.folder
          ? AuditResourceTypeEnum.appFolder
          : type === AppTypeEnum.toolFolder
            ? AuditResourceTypeEnum.toolFolder
            : ToolTypeList.includes(type)
              ? AuditResourceTypeEnum.tool
              : AuditResourceTypeEnum.app;
      expect(addAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEventEnum.UPDATE_APP_INFO,
          params: expect.objectContaining({ appName: 'before', newItemValues: ['after'] }),
          resources: [
            expect.objectContaining({
              type: expectedResourceType,
              id: String(app._id),
              name: 'after'
            })
          ]
        })
      );
    }
  );

  it('records only modified app profile fields and marks avatar update with empty value', async () => {
    const { owner } = await getFakeUsers(1);
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      type: AppTypeEnum.simple,
      name: '客服助手',
      intro: '旧介绍',
      avatar: '/old.png'
    });

    const result = await Call(handler, {
      auth: owner,
      query: { appId: String(app._id) },
      body: {
        name: '客服助手',
        intro: '处理售后咨询与工单分流',
        avatar: '/new.png'
      }
    });

    expect(result.code).toBe(200);
    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEventEnum.UPDATE_APP_INFO,
        params: expect.objectContaining({
          newItemNames: ['common:Intro', 'account_team:dataset_config_item_avatar'],
          newItemValues: ['处理售后咨询与工单分流', '']
        })
      })
    );
  });
});
