import handler from '@/pages/api/core/app/list';
import handlerV2 from '@/pages/api/core/app/listV2';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type {
  ListAppBodyType,
  ListAppResponseType,
  ListAppV2BodyType,
  ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { updateAppPin } from '@fastgpt/service/core/app/controller';
import { onCreateApp } from '@/pages/api/core/app/create';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

describe('POST /api/core/app/list', () => {
  it.each([false, true])(
    'does not read an unpinned app twice after the first database read (V2=%s)',
    async (useV2) => {
      const user = await getUser(`pin-concurrent-${getNanoid(6)}`);
      const [pinned, normal] = await MongoApp.create([
        {
          name: 'Pinned',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          isPinned: true,
          pinnedAt: new Date(),
          updateTime: new Date('2025-01-01')
        },
        {
          name: 'Normal',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          updateTime: new Date('2020-01-01')
        }
      ]);
      let changed = false;
      const unpinAfterRead = async () => {
        if (changed) return;
        changed = true;
        await updateAppPin({ teamId: user.teamId, appId: String(pinned._id), isPinned: false });
      };
      const find = MongoApp.find.bind(MongoApp);
      const aggregate = MongoApp.aggregate.bind(MongoApp);
      const findSpy = vi.spyOn(MongoApp, 'find').mockImplementation((...args) => {
        const query = find(...args);
        const exec = query.exec.bind(query);
        query.exec = async () => {
          const result = await exec();
          await unpinAfterRead();
          return result;
        };
        return query;
      });
      const aggregateSpy = vi.spyOn(MongoApp, 'aggregate').mockImplementation((...args) => {
        const query = aggregate(...args);
        const exec = query.exec.bind(query);
        query.exec = async () => {
          const result = await exec();
          await unpinAfterRead();
          return result;
        };
        return query;
      });
      try {
        const list = await (async () => {
          if (useV2) {
            const response = await Call<
              ListAppV2BodyType,
              Record<string, never>,
              ListAppV2ResponseType
            >(handlerV2, {
              auth: user,
              body: { pinnedFirst: true, pageSize: 2 }
            });
            expect(response.data.total).toBe(2);
            return response.data.list;
          }
          const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
            handler,
            {
              auth: user,
              body: { pinnedFirst: true }
            }
          );
          return response.data;
        })();
        expect(changed).toBe(true);
        expect(list.map((app) => String(app._id))).toEqual([
          String(pinned._id),
          String(normal._id)
        ]);
        expect(
          list.every(
            (app) => !('_pinRank' in app) && !('_listSortTime' in app) && !('pinnedAt' in app)
          )
        ).toBe(true);
      } finally {
        findSpy.mockRestore();
        aggregateSpy.mockRestore();
      }
    }
  );

  it.each([false, true])('restores an unpinned app among missing flags (V2=%s)', async (useV2) => {
    const user = await getUser(`pin-restore-${getNanoid(6)}`);
    const [older, newer] = await MongoApp.create([
      {
        name: 'Older',
        type: AppTypeEnum.workflow,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date('2020-01-01')
      },
      {
        name: 'Newer',
        type: AppTypeEnum.workflow,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date('2021-01-01')
      }
    ]);
    await updateAppPin({ teamId: user.teamId, appId: String(older._id), isPinned: true });
    await updateAppPin({ teamId: user.teamId, appId: String(older._id), isPinned: false });
    if (useV2) {
      const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
        handlerV2,
        {
          auth: user,
          body: { pinnedFirst: true, pageSize: 1 }
        }
      );
      expect(response.data.total).toBe(2);
      expect(response.data.list.map((app) => String(app._id))).toEqual([String(newer._id)]);
    } else {
      const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
        handler,
        {
          auth: user,
          body: { pinnedFirst: true }
        }
      );
      expect(response.data.map((app) => String(app._id))).toEqual([
        String(newer._id),
        String(older._id)
      ]);
    }
  });

  it.each([undefined, false])(
    'omits pin fields from V2 default responses (%s)',
    async (pinnedFirst) => {
      const user = await getUser(`pin-contract-${getNanoid(6)}`);
      await MongoApp.create(
        [true, false, undefined].map((isPinned) => ({
          name: 'App',
          teamId: user.teamId,
          tmbId: user.tmbId,
          type: AppTypeEnum.workflow,
          isPinned,
          ...(isPinned && { pinnedAt: new Date() })
        }))
      );
      const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
        handlerV2,
        {
          auth: user,
          body: { pinnedFirst }
        }
      );
      expect(response.data.list).toHaveLength(3);
      expect(response.data.list.every((app) => !('isPinned' in app) && !('pinnedAt' in app))).toBe(
        true
      );
      const legacy = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
        handler,
        { auth: user, body: { pinnedFirst } }
      );
      expect(legacy.data).toHaveLength(3);
      expect(legacy.data.every((app) => !('isPinned' in app) && !('pinnedAt' in app))).toBe(true);
    }
  );

  it('paginates across pinned folders and normal apps without duplicate or missing items', async () => {
    const user = await getUser(`pin-pages-${getNanoid(6)}`);
    await MongoApp.create(
      Array.from({ length: 6 }, (_, index) => ({
        name: `Page ${index}`,
        teamId: user.teamId,
        tmbId: user.tmbId,
        type: index === 0 ? AppTypeEnum.folder : AppTypeEnum.workflow,
        updateTime: new Date(`2020-01-0${6 - index}`),
        ...(index < 3
          ? { isPinned: true, pinnedAt: new Date(`2021-01-0${3 - index}`) }
          : index === 3
            ? { isPinned: false }
            : {})
      }))
    );
    const names: string[] = [];
    for (const pageNum of [1, 2, 3, 4]) {
      const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
        handlerV2,
        {
          auth: user,
          body: { pinnedFirst: true, pageNum, pageSize: 2 }
        }
      );
      expect(response.data.total).toBe(6);
      names.push(...response.data.list.map((app) => app.name));
    }
    expect(names).toEqual(['Page 0', 'Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5']);
  });

  it('searches and filters before pin pagination without the V1 50-hit cap', async () => {
    const user = await getUser(`pin-search-pages-${getNanoid(6)}`);
    await MongoApp.create(
      Array.from({ length: 65 }, (_, index) => ({
        name: `Match ${index}`,
        teamId: user.teamId,
        tmbId: user.tmbId,
        type: AppTypeEnum.workflow,
        isPinned: index === 0,
        ...(index === 0 && { pinnedAt: new Date() })
      }))
    );
    const response = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: user,
        body: {
          pinnedFirst: true,
          searchKey: 'Match',
          type: AppTypeEnum.workflow,
          tmbIds: [user.tmbId],
          offset: 50,
          pageSize: 20
        }
      }
    );
    expect(response.data.total).toBe(65);
    expect(response.data.list).toHaveLength(15);
    const empty = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: user,
        body: { pinnedFirst: true, searchKey: 'absent' }
      }
    );
    expect(empty.data).toEqual({ list: [], total: 0 });
  });

  it('reads hasInteractiveNode from published version nodes', async () => {
    const owner = await getUser(`app-list-interactive-${getNanoid(6)}`);
    const startNode = {
      nodeId: 'start-1',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      inputs: [],
      outputs: []
    };
    const formInputNode = {
      nodeId: 'form-1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      name: 'Form',
      inputs: [],
      outputs: []
    };
    const interactiveAppId = await onCreateApp({
      name: 'interactive app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [startNode, formInputNode]
    });
    const leftoverModulesAppId = await onCreateApp({
      name: 'leftover modules app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [startNode]
    });
    await MongoApp.collection.updateOne(
      { _id: new Types.ObjectId(leftoverModulesAppId) },
      { $set: { modules: [formInputNode] } }
    );
    const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
      auth: owner,
      body: {}
    });
    const findApp = (appId: string) => res.data.find((item) => String(item._id) === appId);
    expect(res.code).toBe(200);
    expect(findApp(interactiveAppId)?.hasInteractiveNode).toBe(true);
    expect(findApp(leftoverModulesAppId)?.hasInteractiveNode).toBe(false);
    expect(res.data.every((app) => !('modules' in app))).toBe(true);
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

  it('keeps the original array response', async () => {
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
      body: { type: AppTypeEnum.simple }
    });

    expect(res.code).toBe(200);
    expect(res.data).toHaveLength(3);
    expect(res.data[0].name).toBe('App 1');
  });

  it('returns a stable paginated result from V2', async () => {
    const user = await getUser(`app-list-v2-${getNanoid(6)}`);
    await MongoApp.create(
      [3, 2, 1].map((index) => ({
        name: `App ${index}`,
        type: AppTypeEnum.simple,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date(`2024-01-0${index}T00:00:00.000Z`)
      }))
    );
    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: user,
        body: { type: AppTypeEnum.simple, pageNum: 2, pageSize: 1 }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(3);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('App 2');
  });

  it('applies permission filtering before the search limit', async () => {
    const { owner, members } = await getFakeUsers(2);
    const [permittedApp] = await MongoApp.create([
      {
        name: 'needle permitted app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }
    ]);
    await MongoApp.create(
      Array.from({ length: 60 }, (_, index) => ({
        name: `needle inaccessible app ${String(index).padStart(2, '0')}`,
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }))
    );
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: owner.teamId,
      resourceId: permittedApp._id,
      tmbId: members[0].tmbId,
      permission: ReadPermissionVal
    });
    const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      { auth: members[0], body: { searchKey: 'needle' } }
    );
    expect(response.code).toBe(200);
    expect(response.data).toEqual([
      expect.objectContaining({ _id: String(permittedApp._id), name: 'needle permitted app' })
    ]);
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
    expect(createDesc.data.map((app) => app.createTime)).toEqual([
      newerId.getTimestamp(),
      olderId.getTimestamp()
    ]);
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

  it('applies shared filters in V2', async () => {
    const { owner, members } = await getFakeUsers(2);
    const [olderApp, newerApp] = await MongoApp.create([
      {
        name: 'Older member app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: members[0].tmbId,
        createTime: new Date('2026-01-01T00:00:00.000Z'),
        modules: []
      },
      {
        name: 'Newer member app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: members[0].tmbId,
        createTime: new Date('2026-02-01T00:00:00.000Z'),
        modules: []
      }
    ]);

    const filtered = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: owner,
        body: {
          type: AppTypeEnum.workflow,
          tmbIds: [String(members[0].tmbId)],
          sort: AppListSortEnum.createTimeAsc
        }
      }
    );
    expect(filtered.code).toBe(200);
    expect(filtered.data.total).toBe(2);
    expect(filtered.data.list.map((app) => String(app._id))).toEqual([
      String(olderApp._id),
      String(newerApp._id)
    ]);

    const empty = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: owner,
        body: { type: AppTypeEnum.workflow, tmbIds: [] }
      }
    );
    expect(empty.data).toEqual({ list: [], total: 0 });
  });

  it('excludes an app before applying pagination in V2', async () => {
    const user = await getUser(`app-list-v2-exclude-${getNanoid(6)}`);
    const [excludedApp] = await MongoApp.create(
      [3, 2, 1].map((index) => ({
        name: `App ${index}`,
        type: AppTypeEnum.simple,
        teamId: user.teamId,
        tmbId: user.tmbId,
        updateTime: new Date(`2024-01-0${index}T00:00:00.000Z`)
      }))
    );
    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: user,
        body: {
          type: AppTypeEnum.simple,
          pageNum: 1,
          pageSize: 1,
          excludeAppId: String(excludedApp._id)
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(2);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].name).toBe('App 2');
  });

  it('normalizes nullish avatar and intro from legacy records in V2', async () => {
    const user = await getUser(`app-list-v2-legacy-${getNanoid(6)}`);
    const app = await MongoApp.create({
      name: 'Legacy App',
      type: AppTypeEnum.simple,
      teamId: user.teamId,
      tmbId: user.tmbId,
      updateTime: new Date('2024-01-01T00:00:00.000Z')
    });
    expect((await MongoApp.findById(app._id).lean())?.avatar).toBeUndefined();
    await MongoApp.collection.updateOne(
      { _id: new Types.ObjectId(String(app._id)) },
      { $set: { avatar: null }, $unset: { intro: '' } }
    );

    const res = await Call<ListAppV2BodyType, Record<string, never>, ListAppV2ResponseType>(
      handlerV2,
      {
        auth: user,
        body: { type: AppTypeEnum.simple }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.list).toContainEqual(
      expect.objectContaining({ name: 'Legacy App', avatar: '/icon/logo.svg', intro: '' })
    );
  });

  describe('pinned ordering', () => {
    const createPinnedFixtures = async (user: Awaited<ReturnType<typeof getUser>>) => {
      const [normal, pinnedEarlier, pinnedLatest] = await MongoApp.create([
        {
          name: '普通应用',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          createTime: new Date('2026-01-01T00:00:00.000Z'),
          updateTime: new Date('2026-01-03T00:00:00.000Z'),
          modules: []
        },
        {
          name: '较早置顶',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          isPinned: true,
          pinnedAt: new Date('2026-02-01T00:00:00.000Z'),
          createTime: new Date('2026-03-01T00:00:00.000Z'),
          updateTime: new Date('2026-01-01T00:00:00.000Z'),
          modules: []
        },
        {
          name: '最新置顶',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          isPinned: true,
          pinnedAt: new Date('2026-03-01T00:00:00.000Z'),
          createTime: new Date('2026-02-01T00:00:00.000Z'),
          updateTime: new Date('2026-01-02T00:00:00.000Z'),
          modules: []
        }
      ]);

      return { normal, pinnedEarlier, pinnedLatest };
    };

    it('keeps the original order and omits the pin state when pin ordering is off', async () => {
      const user = await getUser(`app-list-pin-off-${getNanoid(6)}`);
      await createPinnedFixtures(user);

      const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
        auth: user,
        body: { type: AppTypeEnum.workflow }
      });

      expect(res.code).toBe(200);
      expect(res.data.map((app) => app.name)).toEqual(['普通应用', '最新置顶', '较早置顶']);
      expect(res.data.every((app) => !('isPinned' in app))).toBe(true);
    });

    it('puts pinned apps first ordered by pin time when no sort is chosen', async () => {
      const user = await getUser(`app-list-pin-default-${getNanoid(6)}`);
      await createPinnedFixtures(user);

      const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
        auth: user,
        body: { type: AppTypeEnum.workflow, pinnedFirst: true }
      });

      expect(res.code).toBe(200);
      // 置顶组内按置顶时间倒序，普通组按修改时间倒序
      expect(res.data.map((app) => app.name)).toEqual(['最新置顶', '较早置顶', '普通应用']);
      expect(res.data.map((app) => app.isPinned)).toEqual([true, true, undefined]);
    });

    it('orders pinned and normal groups by the chosen sort condition', async () => {
      const user = await getUser(`app-list-pin-sort-${getNanoid(6)}`);
      await createPinnedFixtures(user);

      const desc = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
        handler,
        {
          auth: user,
          body: {
            type: AppTypeEnum.workflow,
            pinnedFirst: true,
            sort: AppListSortEnum.createTimeDesc
          }
        }
      );
      expect(desc.data.map((app) => app.name)).toEqual(['较早置顶', '最新置顶', '普通应用']);

      const asc = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
        auth: user,
        body: {
          type: AppTypeEnum.workflow,
          pinnedFirst: true,
          sort: AppListSortEnum.createTimeAsc
        }
      });
      // 置顶组始终在前，组内随所选排序条件翻转
      expect(asc.data.map((app) => app.name)).toEqual(['最新置顶', '较早置顶', '普通应用']);
    });

    it('promotes the pinned app among search hits', async () => {
      const user = await getUser(`app-list-pin-search-${getNanoid(6)}`);
      await MongoApp.create([
        {
          name: '客服 普通',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          updateTime: new Date('2026-01-02T00:00:00.000Z'),
          modules: []
        },
        {
          name: '客服 置顶',
          type: AppTypeEnum.workflow,
          teamId: user.teamId,
          tmbId: user.tmbId,
          isPinned: true,
          pinnedAt: new Date('2026-01-01T00:00:00.000Z'),
          updateTime: new Date('2026-01-01T00:00:00.000Z'),
          modules: []
        }
      ]);

      const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
        auth: user,
        body: { type: AppTypeEnum.workflow, searchKey: '客服', pinnedFirst: true }
      });

      expect(res.code).toBe(200);
      expect(res.data.map((app) => app.name)).toEqual(['客服 置顶', '客服 普通']);
    });
  });
});
