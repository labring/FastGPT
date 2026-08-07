import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import handler from '@/pages/api/core/ai/skill/listV2';
import oldHandler from '@/pages/api/core/ai/skill/list';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type {
  ListSkillsV2Query,
  ListSkillsV2Response
} from '@fastgpt/global/openapi/core/ai/skill/api';

const createSkill = (data: {
  name: string;
  teamId?: string | null;
  tmbId?: string | null;
  type?: AgentSkillTypeEnum;
  source?: AgentSkillSourceEnum;
  parentId?: string | null;
  inheritPermission?: boolean;
}) =>
  MongoAgentSkills.create({
    name: data.name,
    type: data.type ?? AgentSkillTypeEnum.skill,
    source: data.source ?? AgentSkillSourceEnum.personal,
    ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
    ...(data.tmbId !== undefined ? { tmbId: data.tmbId } : {}),
    ...(data.parentId !== undefined
      ? { parentId: data.parentId ? new Types.ObjectId(data.parentId) : null }
      : {}),
    ...(data.inheritPermission !== undefined ? { inheritPermission: data.inheritPermission } : {})
  });

describe('POST /api/core/ai/skill/listV2', () => {
  it('owner + mine：与旧接口可见集合一致（相等）', async () => {
    const owner = await getUser(`listv2-sk-owner-${getNanoid(6)}`);
    await createSkill({ name: 'S1', teamId: owner.teamId, tmbId: owner.tmbId });

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: owner, body: { source: 'mine', pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { source: 'mine' } });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.list.map((item: { _id: string }) => String(item._id))
    );
  });

  it('非 owner + tmb 直授：与旧一致（相等）', async () => {
    const owner = await getUser(`listv2-sk-nonowner-${getNanoid(6)}`);
    const member = await getUser(`listv2-sk-nonowner-m-${getNanoid(6)}`, owner.teamId);

    const granted = await createSkill({
      name: 'Granted',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await createSkill({ name: 'Not Granted', teamId: owner.teamId, tmbId: owner.tmbId });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: granted._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: member, body: { source: 'mine', pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: { source: 'mine' } });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.list.map((item: { _id: string }) => String(item._id));
    expect(v2Ids).toEqual(oldIds);
    expect(v2Ids).toContain(String(granted._id));
  });

  it('store + 非 owner：仅权限记录内的 system skill 可见（权威语义，与旧列表一致）', async () => {
    const owner = await getUser(`listv2-sk-store-${getNanoid(6)}`);
    const member = await getUser(`listv2-sk-store-m-${getNanoid(6)}`, owner.teamId);

    const grantedSystem = await createSkill({
      name: 'System Granted',
      source: AgentSkillSourceEnum.system,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await createSkill({
      name: 'System Not Granted',
      source: AgentSkillSourceEnum.system,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: grantedSystem._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: member, body: { source: 'store', pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: member, body: { source: 'store' } });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    const oldIds = oldRes.data.list.map((item: { _id: string }) => String(item._id));
    // 无权限记录的 system skill 不展示（与旧列表语义一致，perMatch 未因 store 取消）
    expect(v2Ids).toEqual(oldIds);
    expect(v2Ids).toEqual([String(grantedSystem._id)]);
  });

  it('skillIds 分支：非 owner 无权 skill 被过滤（与旧一致）', async () => {
    const owner = await getUser(`listv2-sk-ids-${getNanoid(6)}`);
    const member = await getUser(`listv2-sk-ids-m-${getNanoid(6)}`, owner.teamId);

    const owned = await createSkill({ name: 'Owned', teamId: owner.teamId, tmbId: member.tmbId });
    const protectedSkill = await createSkill({
      name: 'Protected',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: owned._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const body: ListSkillsV2Query = {
      source: 'mine',
      skillIds: [String(owned._id), String(protectedSkill._id)],
      pageSize: 100
    };
    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: member, body }
    );
    const oldRes = await Call(oldHandler, { auth: member, body });

    expect(res.code).toBe(200);
    expect(res.data.list.map((item) => String(item._id))).toEqual(
      oldRes.data.list.map((item: { _id: string }) => String(item._id))
    );
    expect(res.data.list.map((item) => String(item._id))).toEqual([String(owned._id)]);
  });

  it('目录继承：父文件夹 read → 子 skill 可见（与旧一致）', async () => {
    const owner = await getUser(`listv2-sk-inherit-${getNanoid(6)}`);
    const member = await getUser(`listv2-sk-inherit-m-${getNanoid(6)}`, owner.teamId);

    const folder = await createSkill({
      name: 'Folder',
      type: AgentSkillTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const child = await createSkill({
      name: 'Child',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: String(folder._id),
      inheritPermission: true
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: folder._id,
      tmbId: member.tmbId,
      permission: ReadRoleVal
    });

    const body: ListSkillsV2Query = {
      source: 'mine',
      parentId: String(folder._id),
      pageSize: 100
    };
    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: member, body }
    );
    const oldRes = await Call(oldHandler, { auth: member, body });

    expect(res.code).toBe(200);
    const v2Ids = res.data.list.map((item) => String(item._id));
    expect(v2Ids).toContain(String(child._id));
    expect(v2Ids).toEqual(oldRes.data.list.map((item: { _id: string }) => String(item._id)));
  });

  it('分页：total 为全量计数（25 条 / pageSize 10 → total 25、list 10）', async () => {
    const owner = await getUser(`listv2-sk-paging-${getNanoid(6)}`);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createSkill({ name: `S ${i}`, teamId: owner.teamId, tmbId: owner.tmbId })
      )
    );

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: owner, body: { source: 'mine', pageSize: 10, pageNum: 1 } }
    );

    expect(res.code).toBe(200);
    expect(res.data.total).toBe(25);
    expect(res.data.list).toHaveLength(10);
    expect(res.data.total).toBeGreaterThan(res.data.list.length);
  });

  it('owner + store + tmbId=null 的 system skill：v2 保留 + 占位，旧接口丢项', async () => {
    const owner = await getUser(`listv2-sk-system-${getNanoid(6)}`);
    // 与 controller.test.ts:262-276 相同的 system skill 夹具（teamId/tmbId 为 null）
    await createSkill({
      name: 'Null Tmb System Skill',
      source: AgentSkillSourceEnum.system,
      teamId: null,
      tmbId: null
    });

    const res = await Call<ListSkillsV2Query, Record<string, never>, ListSkillsV2Response>(
      handler,
      { auth: owner, body: { source: 'store', pageSize: 100 } }
    );
    const oldRes = await Call(oldHandler, { auth: owner, body: { source: 'store' } });

    expect(res.code).toBe(200);
    const v2System = res.data.list.find((item) => item.name === 'Null Tmb System Skill');
    // v2：保留 + 占位（status null）
    expect(v2System).toBeDefined();
    expect(v2System!.tmbId).toBeNull();
    expect(v2System!.sourceMember).toEqual({ name: '未知成员', avatar: null, status: null });
    // 旧接口：addSourceMember 丢项（tmbId null）
    const oldIds = oldRes.data.list.map((item: { _id: string }) => String(item._id));
    expect(oldIds).not.toContain(String(v2System!._id));
  });
});
