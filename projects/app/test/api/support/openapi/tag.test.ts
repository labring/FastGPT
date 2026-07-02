import createHandler from '@/pages/api/support/openapi/tag/create';
import deleteHandler from '@/pages/api/support/openapi/tag/delete';
import listHandler from '@/pages/api/support/openapi/tag/list';
import updateHandler from '@/pages/api/support/openapi/tag/update';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoOpenApiTag } from '@fastgpt/service/support/openapi/tag/schema';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('support/openapi/tag', () => {
  it('does not create default system tags when listing tags', async () => {
    const user = await getRootUser();

    const first = await Call(listHandler, {
      auth: user
    });
    const second = await Call(listHandler, {
      auth: user
    });

    expect(first.code).toBe(200);
    expect(second.code).toBe(200);
    expect(first.data).toEqual([]);
    expect(second.data).toEqual([]);
    expect(await MongoOpenApiTag.countDocuments({ teamId: user.teamId, tmbId: user.tmbId })).toBe(
      0
    );
  });

  it('creates custom tags and rejects duplicate names for the same member', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;

    const created = await Call(createHandler, {
      auth: owner,
      body: {
        name: '客户 A'
      }
    });
    const duplicated = await Call(createHandler, {
      auth: owner,
      body: {
        name: ' 客户 A '
      }
    });
    const sameNameForOtherMember = await Call(createHandler, {
      auth: member,
      body: {
        name: '客户 A'
      }
    });

    expect(created.code).toBe(200);
    expect(created.data.name).toBe('客户 A');
    expect(created.data.type).toBe('custom');
    expect(duplicated.code).toBe(500);
    expect(sameNameForOtherMember.code).toBe(200);
  });

  it('puts newly created tags at the beginning of the tag list', async () => {
    const user = await getRootUser();

    const created = await Call(createHandler, {
      auth: user,
      body: {
        name: '新建在最前'
      }
    });
    const list = await Call(listHandler, {
      auth: user
    });

    expect(created.code).toBe(200);
    expect(list.code).toBe(200);
    expect(list.data[0]._id).toBe(created.data._id);
    expect(list.data[0].name).toBe('新建在最前');
  });

  it('limits tag name to 50 chars', async () => {
    const user = await getRootUser();
    const allowedName = 'a'.repeat(50);
    const rejectedName = 'b'.repeat(51);

    const created = await Call(createHandler, {
      auth: user,
      body: {
        name: allowedName
      }
    });
    const rejectedCreate = await Call(createHandler, {
      auth: user,
      body: {
        name: rejectedName
      }
    });
    const rejectedUpdate = await Call(updateHandler, {
      auth: user,
      body: {
        tagId: created.data._id,
        name: rejectedName
      }
    });

    expect(created.code).toBe(200);
    expect(rejectedCreate.code).toBe(500);
    expect(rejectedUpdate.code).toBe(500);
    expect(await MongoOpenApiTag.findOne({ name: allowedName })).not.toBeNull();
    expect(await MongoOpenApiTag.findOne({ name: rejectedName })).toBeNull();
  });

  it('rejects empty tag name after trimming', async () => {
    const user = await getRootUser();

    const rejectedCreate = await Call(createHandler, {
      auth: user,
      body: {
        name: '   '
      }
    });

    expect(rejectedCreate.code).toBe(500);
    expect(await MongoOpenApiTag.findOne({ name: '   ' })).toBeNull();
  });

  it('updates custom tags and treats historical system tags as normal tags', async () => {
    const user = await getRootUser();
    const [systemTag] = await MongoOpenApiTag.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '历史系统标签',
        normalizedName: '历史系统标签',
        type: 'system',
        order: 1
      }
    ]);
    const customTag = await Call(createHandler, {
      auth: user,
      body: {
        name: '临时客户'
      }
    });

    const updateCustom = await Call(updateHandler, {
      auth: user,
      body: {
        tagId: customTag.data._id,
        name: '客户 B',
        order: 5
      }
    });
    const updateSystem = await Call(updateHandler, {
      auth: user,
      body: {
        tagId: String(systemTag._id),
        name: '历史标签改名'
      }
    });

    expect(updateCustom.code).toBe(200);
    expect(updateSystem.code).toBe(200);

    const updated = await MongoOpenApiTag.findById(customTag.data._id).lean();
    const updatedSystem = await MongoOpenApiTag.findById(systemTag._id).lean();
    expect(updated?.name).toBe('客户 B');
    expect(updated?.order).toBe(5);
    expect(updatedSystem?.name).toBe('历史标签改名');
  });

  it('deletes historical system tags and unbinds them from APIKeys', async () => {
    const user = await getRootUser();
    const [systemTag] = await MongoOpenApiTag.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '历史系统标签',
        normalizedName: '历史系统标签',
        type: 'system',
        order: 1
      }
    ]);
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-system-tagged',
      name: 'system tagged',
      tagIds: [systemTag._id]
    });

    const deleted = await Call(deleteHandler, {
      auth: user,
      query: {
        tagId: String(systemTag._id)
      }
    });

    expect(deleted.code).toBe(200);
    expect(await MongoOpenApiTag.findById(systemTag._id)).toBeNull();
    const key = await MongoOpenApi.findOne({ name: 'system tagged' }).lean();
    expect(key?.tagIds || []).toHaveLength(0);
  });

  it('deletes custom tags and unbinds them from current member APIKeys', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [member] = members;
    const ownerTag = await Call(createHandler, {
      auth: owner,
      body: {
        name: '待删除'
      }
    });
    const memberTag = await Call(createHandler, {
      auth: member,
      body: {
        name: '待删除'
      }
    });

    await MongoOpenApi.create([
      {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKey: 'fastgpt-owner-tagged',
        name: 'owner tagged',
        tagIds: [ownerTag.data._id]
      },
      {
        teamId: member.teamId,
        tmbId: member.tmbId,
        apiKey: 'fastgpt-member-tagged',
        name: 'member tagged',
        tagIds: [memberTag.data._id]
      }
    ]);

    const deleted = await Call(deleteHandler, {
      auth: owner,
      query: {
        tagId: ownerTag.data._id
      }
    });

    expect(deleted.code).toBe(200);
    expect(await MongoOpenApiTag.findById(ownerTag.data._id)).toBeNull();

    const ownerKey = await MongoOpenApi.findOne({ name: 'owner tagged' }).lean();
    const memberKey = await MongoOpenApi.findOne({ name: 'member tagged' }).lean();
    expect(ownerKey?.tagIds || []).toHaveLength(0);
    expect((memberKey?.tagIds || []).map(String)).toEqual([memberTag.data._id]);
  });

  it('returns key count when requested', async () => {
    const user = await getRootUser();
    const tag = await Call(createHandler, {
      auth: user,
      body: {
        name: '统计'
      }
    });
    await MongoOpenApi.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      apiKey: 'fastgpt-count-tagged',
      name: 'count tagged',
      tagIds: [tag.data._id]
    });

    const list = await Call(listHandler, {
      auth: user,
      query: {
        withKeyCount: true
      }
    });

    const countedTag = list.data.find((item) => item._id === tag.data._id);
    expect(countedTag?.keyCount).toBe(1);
  });
});
