import handler from '@/pages/api/core/app/list';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type {
  ListAppBodyType,
  ListAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('POST /api/core/app/list', () => {
  it('derives the interactive-node flag from the projected flow node type', async () => {
    const { owner } = await getFakeUsers(1);
    await MongoApp.create([
      {
        name: 'Interactive app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        modules: [
          {
            flowNodeType: FlowNodeTypeEnum.formInput,
            inputs: [{ key: 'large-input', value: 'content that the list response does not need' }]
          }
        ]
      },
      {
        name: 'Regular app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        modules: [{ flowNodeType: FlowNodeTypeEnum.chatNode, inputs: [] }]
      }
    ]);

    const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow }
      }
    );

    expect(response.code).toBe(200);
    expect(response.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Interactive app', hasInteractiveNode: true }),
        expect.objectContaining({ name: 'Regular app', hasInteractiveNode: false })
      ])
    );
    expect(response.data.list.every((app) => !('modules' in app))).toBe(true);
  });

  it('returns only apps covered by the current member resource permission group', async () => {
    const { owner, members } = await getFakeUsers(2);
    const [permittedApp, inaccessibleApp] = await MongoApp.create([
      {
        name: 'Permitted app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        modules: []
      },
      {
        name: 'Inaccessible app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        modules: []
      }
    ]);
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: permittedApp._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: inaccessibleApp._id,
        tmbId: members[1].tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: members[0],
        body: { type: AppTypeEnum.workflow }
      }
    );

    expect(response.code).toBe(200);
    expect(response.data.list.map((app) => app.name)).toEqual(['Permitted app']);
    expect(response.data.list[0]?.permission.hasReadPer).toBe(true);
  });

  it('returns a stable paginated result for the current directory', async () => {
    const user = await getUser(`app-list-${getNanoid(6)}`);
    const updateTimes = [
      new Date('2024-01-03T00:00:00.000Z'),
      new Date('2024-01-02T00:00:00.000Z'),
      new Date('2024-01-01T00:00:00.000Z')
    ];

    await MongoApp.create(
      updateTimes.map((updateTime, index) => ({
        name: `App ${index + 1}`,
        type: AppTypeEnum.simple,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime
      }))
    );

    const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
      auth: user,
      body: {
        type: AppTypeEnum.simple,
        pageNum: 2,
        pageSize: 1
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('App 2');
  });
});
