import handler from '@/pages/api/core/app/list';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type {
  ListAppBodyType,
  ListAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
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
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Interactive app', hasInteractiveNode: true }),
        expect.objectContaining({ name: 'Regular app', hasInteractiveNode: false })
      ])
    );
    expect(response.data.every((app) => !('modules' in app))).toBe(true);
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
    expect(response.data.map((app) => app.name)).toEqual(['Permitted app']);
    expect(response.data[0]?.permission.hasReadPer).toBe(true);
  });

  it('defaults to recently modified order and supports createTime sort', async () => {
    const { owner } = await getFakeUsers(1);
    const olderId = Types.ObjectId.createFromTime(1_700_000_000);
    const newerId = Types.ObjectId.createFromTime(1_800_000_000);
    await MongoApp.create([
      {
        _id: olderId,
        name: '较早创建',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        createTime: olderId.getTimestamp(),
        updateTime: new Date('2026-09-02T00:00:00.000Z'),
        modules: []
      },
      {
        _id: newerId,
        name: '较晚创建',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        createTime: newerId.getTimestamp(),
        updateTime: new Date('2026-01-01T00:00:00.000Z'),
        modules: []
      }
    ]);

    const defaultRes = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow }
      }
    );
    expect(defaultRes.data.map((app) => app.name)).toEqual(['较早创建', '较晚创建']);

    const createDesc = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow, sort: AppListSortEnum.createTimeDesc }
      }
    );
    expect(createDesc.data.map((app) => app.name)).toEqual(['较晚创建', '较早创建']);
  });

  it('filters by creator tmbIds and returns empty list for empty tmbIds', async () => {
    const { owner, members } = await getFakeUsers(2);
    await MongoApp.create([
      {
        name: 'Owner app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        modules: []
      },
      {
        name: 'Member app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: members[0].tmbId,
        modules: []
      }
    ]);

    const filtered = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow, tmbIds: [String(members[0].tmbId)] }
      }
    );
    expect(filtered.data.map((app) => app.name)).toEqual(['Member app']);

    const emptied = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow, tmbIds: [] }
      }
    );
    expect(emptied.data).toEqual([]);
  });
});
