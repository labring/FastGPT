import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeGroups, getFakeOrgs, getFakeUsers } from '@test/datas/users';

/**
 * 资源权限继承同步性能基准（真实 mongo）。
 *
 * 测量对象：updateResourceCollaborators（写入父级 ACL + 向全部继承子资源批量传播物化 ACL）。
 * 与单元测试不同，这里不 mock 仓储层，直接跑真实 mongo；用 vi.spyOn 只做"计数不拦截"，
 * 统计树遍历查询次数与 patchResources 的补丁构成。
 *
 * 运行：pnpm --filter service test:benchmark
 * （按 vitest.benchmark.config.ts，单文件串行，结果写入 benchmark-results.json）
 *
 * 案例设计：
 *   case 1        5000 直系子资源 + 新增两个权限 → 全量 insert 补丁
 *   case 2        5000 直系子资源 + 增删改三类变更 → insert/update/delete 混合补丁
 *   case 3        5 层文件夹树（10000 节点）新增两个权限 → 多层级传播
 *   supplement A  无变更（old == new）→ 命中 early return，作为基线/对照
 *   supplement B  5000 子资源移除两个权限 → 全量 delete 补丁（与 case 1 对称）
 *   supplement C  独立子树隔离 → 传播在 inheritPermission=false 分支停止
 *   supplement D  规模扩展性（1k/2k/5k）→ 验证时间增长接近线性
 *   supplement E  查询端 distinct：$bitsAnySet 过滤开关对比（10k 资源 / 50k ACL 行）
 */

type FakeUsers = Awaited<ReturnType<typeof getFakeUsers>>;
type PatchResources = typeof resourcePermissionRepo.patchResources;

const PER = PerResourceTypeEnum.app;

const toPermissionMap = (collaborators: { tmbId?: string; permission: number }[]) =>
  new Map(collaborators.map((collaborator) => [collaborator.tmbId, collaborator.permission]));

const bench = async (fn: () => Promise<void>) => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};

const countPatches = (patchSpy: MockInstance<PatchResources>) => {
  const summary = { insert: 0, update: 0, delete: 0, total: 0 };
  for (const [args] of patchSpy.mock.calls) {
    for (const patch of args.patches) {
      summary[patch.action] += 1;
      summary.total += 1;
    }
  }
  return summary;
};

/** 真实 mongo 上测量一次继承同步：计数树遍历 find 调用 + patchResources 补丁构成。 */
const runMeasuredSync = async ({
  teamId,
  folderId,
  oldCollaborators,
  newCollaborators
}: {
  teamId: string;
  folderId: string;
  oldCollaborators: CollaboratorItemType[];
  newCollaborators: CollaboratorItemType[];
}) => {
  const findSpy = vi.spyOn(MongoApp, 'find');
  const patchSpy = vi.spyOn(resourcePermissionRepo, 'patchResources');
  try {
    const ms = await bench(async () => {
      await mongoSessionRun(async (session) => {
        await updateResourceCollaborators({
          resource: { _id: folderId, teamId, type: AppTypeEnum.folder },
          resourceModel: MongoApp,
          resourceType: PER,
          oldCollaborators,
          newCollaborators,
          session
        });
      });
    });
    return { ms, patchSummary: countPatches(patchSpy), findCalls: findSpy.mock.calls.length };
  } finally {
    vi.restoreAllMocks();
  }
};

const logBench = (label: string, detail: string, ms: number, extra?: string) => {
  console.log(`\n[${label}] ${detail}`);
  if (extra) console.log(`  ${extra}`);
  console.log(`  耗时: ${ms.toFixed(1)} ms`);
};

/** 批量创建资源 + 默认 owner ACL，全部在一个事务里完成，作为不记时的 setup。 */
const createAppsBulk = async (
  users: FakeUsers,
  apps: Array<{
    name: string;
    type: AppTypeEnum;
    parentId?: string | null;
    inheritPermission?: boolean;
  }>
) => {
  const teamId = String(users.owner.teamId);
  const tmbId = String(users.owner.tmbId);
  const docs = apps.map((app) => ({
    _id: new Types.ObjectId(),
    teamId,
    tmbId,
    name: app.name,
    type: app.type,
    parentId: app.parentId ? new Types.ObjectId(app.parentId) : null,
    inheritPermission: app.inheritPermission ?? true
  }));
  const aclRows = docs.map((doc) => ({
    teamId,
    resourceType: PER,
    resourceId: doc._id,
    tmbId,
    permission: OwnerRoleVal
  }));

  await mongoSessionRun(async (session) => {
    await MongoApp.insertMany(docs, { session });
    await MongoResourcePermission.insertMany(aclRows, { session });
  });

  return docs.map((doc) => String(doc._id));
};

const buildSingleLevelTree = async (users: FakeUsers, childCount: number) => {
  const [folderId] = await createAppsBulk(users, [
    { name: 'bench-root', type: AppTypeEnum.folder }
  ]);
  const childIds = await createAppsBulk(
    users,
    Array.from({ length: childCount }, (_, i) => ({
      name: `bench-child-${i}`,
      type: AppTypeEnum.simple,
      parentId: folderId
    }))
  );
  return { folderId, childIds };
};

/** 5 层树：1(root) → 9 → 90 → 900 → 9000(leaf)，共 10000 节点。 */
const buildFiveLevelTree = async (users: FakeUsers) => {
  const [rootId] = await createAppsBulk(users, [{ name: 'bench-root', type: AppTypeEnum.folder }]);
  const allIds = [rootId];

  const createLevel = async (
    parentIds: string[],
    perParent: number,
    type: AppTypeEnum,
    levelName: string
  ) => {
    const apps: Array<{ name: string; type: AppTypeEnum; parentId: string }> = [];
    for (const parentId of parentIds) {
      for (let i = 0; i < perParent; i++) {
        apps.push({ name: `${levelName}-${i}`, type, parentId });
      }
    }
    const ids = await createAppsBulk(users, apps);
    allIds.push(...ids);
    return ids;
  };

  const l1 = await createLevel([rootId], 9, AppTypeEnum.folder, 'l1'); // 9
  const l2 = await createLevel(l1, 10, AppTypeEnum.folder, 'l2'); // 90
  const l3 = await createLevel(l2, 10, AppTypeEnum.folder, 'l3'); // 900
  const l4 = await createLevel(l3, 10, AppTypeEnum.simple, 'l4'); // 9000

  return { rootId, allIds, leafIds: l4 };
};

describe.sequential('resource permission inheritance benchmark (real mongo)', () => {
  it('case 1 · 5000 direct children · add two permissions', { timeout: 300000 }, async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const [m0, m1] = users.members;
    const { folderId, childIds } = await buildSingleLevelTree(users, 5000);

    const oldCollaborators = await getResourceOwnedClbs({
      teamId,
      resourceId: folderId,
      resourceType: PER
    });
    const newCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(m0.tmbId), permission: ReadRoleVal },
      { tmbId: String(m1.tmbId), permission: ReadRoleVal }
    ];

    const { ms, patchSummary, findCalls } = await runMeasuredSync({
      teamId,
      folderId,
      oldCollaborators,
      newCollaborators
    });

    // 正确性：每个子资源物化为 [owner, m0 Read, m1 Read]
    const sample = await getResourceOwnedClbs({
      teamId,
      resourceId: childIds[0],
      resourceType: PER
    });
    expect(toPermissionMap(sample)).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(m0.tmbId), ReadRoleVal],
        [String(m1.tmbId), ReadRoleVal]
      ])
    );
    const totalRows = await MongoResourcePermission.countDocuments({ teamId, resourceType: PER });

    expect(patchSummary).toEqual({ insert: 10000, update: 0, delete: 0, total: 10000 });
    expect(findCalls).toBe(2); // 根→children，children→空
    expect(totalRows).toBe(5000 * 3 + 3); // children 各 3 行 + 文件夹 3 行
    expect(ms).toBeLessThan(60000);

    logBench(
      'case 1',
      '5000 direct children + add two permissions',
      ms,
      `patches=${patchSummary.total} (${patchSummary.insert} insert), findCalls=${findCalls}, totalRows=${totalRows}`
    );
  });

  it(
    'case 2 · 5000 direct children · mixed insert/update/delete',
    { timeout: 300000 },
    async () => {
      const users = await getFakeUsers(3);
      const teamId = String(users.owner.teamId);
      const [m0, m1, m2] = users.members;
      const { folderId, childIds } = await buildSingleLevelTree(users, 5000);

      const ownerClb = { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal };
      const initialAcl = [
        ownerClb,
        { tmbId: String(m0.tmbId), permission: ReadRoleVal },
        { tmbId: String(m1.tmbId), permission: WriteRoleVal }
      ];
      const finalAcl = [
        ownerClb,
        { tmbId: String(m0.tmbId), permission: WriteRoleVal },
        { tmbId: String(m2.tmbId), permission: ReadRoleVal }
      ];

      // setup（不记时）：先把 children 物化为 [owner, m0 Read, m1 Write]
      await mongoSessionRun(async (session) => {
        await updateResourceCollaborators({
          resource: { _id: folderId, teamId, type: AppTypeEnum.folder },
          resourceModel: MongoApp,
          resourceType: PER,
          oldCollaborators: [ownerClb],
          newCollaborators: initialAcl,
          session
        });
      });

      // 测量的变更：m0 Read→Write(update)、m1 移除(delete)、m2 新增(insert)
      const { ms, patchSummary, findCalls } = await runMeasuredSync({
        teamId,
        folderId,
        oldCollaborators: initialAcl,
        newCollaborators: finalAcl
      });

      const sample = await getResourceOwnedClbs({
        teamId,
        resourceId: childIds[0],
        resourceType: PER
      });
      expect(toPermissionMap(sample)).toEqual(
        new Map([
          [String(users.owner.tmbId), OwnerRoleVal],
          [String(m0.tmbId), WriteRoleVal],
          [String(m2.tmbId), ReadRoleVal]
        ])
      );
      expect(sample.some((row) => row.tmbId === String(m1.tmbId))).toBe(false);
      const totalRows = await MongoResourcePermission.countDocuments({ teamId, resourceType: PER });

      expect(patchSummary).toEqual({ insert: 5000, update: 5000, delete: 5000, total: 15000 });
      expect(findCalls).toBe(2);
      expect(totalRows).toBe(5000 * 3 + 3);
      expect(ms).toBeLessThan(60000);

      logBench(
        'case 2',
        '5000 direct children + mixed insert/update/delete',
        ms,
        `patches=${patchSummary.total} (insert=${patchSummary.insert}, update=${patchSummary.update}, delete=${patchSummary.delete}), findCalls=${findCalls}`
      );
    }
  );

  it(
    'case 3 · 5-level folder tree (10k nodes) · add two permissions',
    { timeout: 300000 },
    async () => {
      const users = await getFakeUsers(2);
      const teamId = String(users.owner.teamId);
      const [m0, m1] = users.members;
      const { rootId, allIds, leafIds } = await buildFiveLevelTree(users);

      const oldCollaborators = await getResourceOwnedClbs({
        teamId,
        resourceId: rootId,
        resourceType: PER
      });
      const newCollaborators = [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(m0.tmbId), permission: ReadRoleVal },
        { tmbId: String(m1.tmbId), permission: ReadRoleVal }
      ];

      const { ms, patchSummary, findCalls } = await runMeasuredSync({
        teamId,
        folderId: rootId,
        oldCollaborators,
        newCollaborators
      });

      const leafSample = await getResourceOwnedClbs({
        teamId,
        resourceId: leafIds[0],
        resourceType: PER
      });
      expect(toPermissionMap(leafSample)).toEqual(
        new Map([
          [String(users.owner.tmbId), OwnerRoleVal],
          [String(m0.tmbId), ReadRoleVal],
          [String(m1.tmbId), ReadRoleVal]
        ])
      );
      const totalRows = await MongoResourcePermission.countDocuments({ teamId, resourceType: PER });

      const descendants = allIds.length - 1;
      expect(patchSummary).toEqual({
        insert: 2 * descendants,
        update: 0,
        delete: 0,
        total: 2 * descendants
      });
      expect(findCalls).toBe(5); // 根→L1→L2→L3→L4→空
      expect(totalRows).toBe(allIds.length * 3); // 每个资源 3 行 ≈ 1 万
      expect(ms).toBeLessThan(90000);

      logBench(
        'case 3',
        `5-level tree (${allIds.length} resources) + add two permissions`,
        ms,
        `patches=${patchSummary.total} (insert), findCalls=${findCalls}, totalRows=${totalRows}, descendants=${descendants}`
      );
    }
  );

  it('supplement A · no-op ACL (early return control)', { timeout: 180000 }, async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const [m0] = users.members;
    const { folderId } = await buildSingleLevelTree(users, 5000);

    const acl = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(m0.tmbId), permission: ReadRoleVal }
    ];

    // setup（不记时）：先物化 children
    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: { _id: folderId, teamId, type: AppTypeEnum.folder },
        resourceModel: MongoApp,
        resourceType: PER,
        oldCollaborators: [{ tmbId: String(users.owner.tmbId), permission: OwnerRoleVal }],
        newCollaborators: acl,
        session
      });
    });

    // old == new → affectedCollaborators 为空，sync 直接早退，不产生任何子资源写入
    const times: number[] = [];
    let patchTotal = 0;
    for (let i = 0; i < 3; i++) {
      const { ms, patchSummary, findCalls } = await runMeasuredSync({
        teamId,
        folderId,
        oldCollaborators: acl,
        newCollaborators: acl
      });
      times.push(ms);
      patchTotal += patchSummary.total;
      expect(findCalls).toBe(0); // 早退，甚至不遍历树
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    expect(patchTotal).toBe(0); // 没有任何子资源补丁
    expect(avg).toBeLessThan(5000);

    logBench(
      'supplement A',
      'identical ACL, 5000 children (early return)',
      avg,
      `patches=${patchTotal}, findCalls=0, 3 runs avg`
    );
  });

  it(
    'supplement B · 5000 children · remove two permissions (delete-heavy)',
    { timeout: 300000 },
    async () => {
      const users = await getFakeUsers(2);
      const teamId = String(users.owner.teamId);
      const [m0, m1] = users.members;
      const { folderId, childIds } = await buildSingleLevelTree(users, 5000);

      const ownerClb = { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal };
      const fullAcl = [
        ownerClb,
        { tmbId: String(m0.tmbId), permission: ReadRoleVal },
        { tmbId: String(m1.tmbId), permission: WriteRoleVal }
      ];

      await mongoSessionRun(async (session) => {
        await updateResourceCollaborators({
          resource: { _id: folderId, teamId, type: AppTypeEnum.folder },
          resourceModel: MongoApp,
          resourceType: PER,
          oldCollaborators: [ownerClb],
          newCollaborators: fullAcl,
          session
        });
      });

      // 测量的变更：移除 m0、m1 → 10000 delete 补丁
      const { ms, patchSummary, findCalls } = await runMeasuredSync({
        teamId,
        folderId,
        oldCollaborators: fullAcl,
        newCollaborators: [ownerClb]
      });

      const sample = await getResourceOwnedClbs({
        teamId,
        resourceId: childIds[0],
        resourceType: PER
      });
      expect(toPermissionMap(sample)).toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
      const totalRows = await MongoResourcePermission.countDocuments({ teamId, resourceType: PER });

      expect(patchSummary).toEqual({ insert: 0, update: 0, delete: 10000, total: 10000 });
      expect(findCalls).toBe(2);
      expect(totalRows).toBe(5000 + 1);
      expect(ms).toBeLessThan(60000);

      logBench(
        'supplement B',
        '5000 children + remove two permissions',
        ms,
        `patches=${patchSummary.total} (${patchSummary.delete} delete), findCalls=${findCalls}, totalRows=${totalRows}`
      );
    }
  );

  it('supplement C · propagation stops at independent subtree', { timeout: 300000 }, async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const [m0, m1] = users.members;
    const [rootId] = await createAppsBulk(users, [
      { name: 'bench-root', type: AppTypeEnum.folder }
    ]);
    const [subAId, subBId] = await createAppsBulk(users, [
      { name: 'bench-subA', type: AppTypeEnum.folder, parentId: rootId },
      { name: 'bench-subB', type: AppTypeEnum.folder, parentId: rootId, inheritPermission: false }
    ]);
    const subAChildren = await createAppsBulk(
      users,
      Array.from({ length: 500 }, (_, i) => ({
        name: `bench-subA-child-${i}`,
        type: AppTypeEnum.simple,
        parentId: subAId
      }))
    );
    const subBChildren = await createAppsBulk(
      users,
      Array.from({ length: 500 }, (_, i) => ({
        name: `bench-subB-child-${i}`,
        type: AppTypeEnum.simple,
        parentId: subBId
      }))
    );

    const oldCollaborators = await getResourceOwnedClbs({
      teamId,
      resourceId: rootId,
      resourceType: PER
    });
    const newCollaborators = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(m0.tmbId), permission: ReadRoleVal },
      { tmbId: String(m1.tmbId), permission: ReadRoleVal }
    ];

    const { ms, patchSummary, findCalls } = await runMeasuredSync({
      teamId,
      folderId: rootId,
      oldCollaborators,
      newCollaborators
    });

    // subA 子树被物化，subB 独立子树完全不受影响
    const inheritedSample = await getResourceOwnedClbs({
      teamId,
      resourceId: subAChildren[0],
      resourceType: PER
    });
    expect(toPermissionMap(inheritedSample)).toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(m0.tmbId), ReadRoleVal],
        [String(m1.tmbId), ReadRoleVal]
      ])
    );
    const isolatedSample = await getResourceOwnedClbs({
      teamId,
      resourceId: subBChildren[0],
      resourceType: PER
    });
    expect(toPermissionMap(isolatedSample)).toEqual(
      new Map([[String(users.owner.tmbId), OwnerRoleVal]])
    );

    expect(patchSummary).toEqual({ insert: 1002, update: 0, delete: 0, total: 1002 });
    expect(findCalls).toBe(3); // 根→[subA,subB]（只留 subA）→subA children→空
    expect(ms).toBeLessThan(30000);

    logBench(
      'supplement C',
      'root → [inheriting subA(500 children), independent subB(500 children)]',
      ms,
      `patches=${patchSummary.total} (only subA subtree), findCalls=${findCalls}, subB untouched`
    );
  });

  it('supplement D · scaling linearity (1k / 2k / 5k children)', { timeout: 300000 }, async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const [m0, m1] = users.members;
    const ownerClb = { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal };
    const sizes = [1000, 2000, 5000];
    const results: Array<{ size: number; ms: number; patches: number }> = [];

    console.log(`\n[scaling] size\tchildren\tpatches\t耗时(ms)`);

    for (const size of sizes) {
      const { folderId } = await buildSingleLevelTree(users, size);
      const oldCollaborators = await getResourceOwnedClbs({
        teamId,
        resourceId: folderId,
        resourceType: PER
      });
      const { ms, patchSummary } = await runMeasuredSync({
        teamId,
        folderId,
        oldCollaborators,
        newCollaborators: [
          ownerClb,
          { tmbId: String(m0.tmbId), permission: ReadRoleVal },
          { tmbId: String(m1.tmbId), permission: ReadRoleVal }
        ]
      });
      results.push({ size, ms, patches: patchSummary.total });
      console.log(`\t${size}\t${size}\t${patchSummary.total}\t${ms.toFixed(1)}`);
    }

    // 时间增长率应接近规模增长率（线性），允许 2 倍误差
    for (let i = 1; i < results.length; i++) {
      const scaleRatio = results[i].size / results[i - 1].size;
      const timeRatio = results[i].ms / results[i - 1].ms;
      expect(timeRatio).toBeLessThan(scaleRatio * 2);
    }
  });
  it(
    'supplement E · read-path distinct · $bitsAnySet on/off (10k resources / 50k ACL rows)',
    { timeout: 300000 },
    async () => {
      // 真实 fixtures 建立同 team 的成员/分组/组织 id 池；查询侧走字符串匹配（与 buildPermissionQuery 契约一致）
      const users = await getFakeUsers(4);
      const groups = await getFakeGroups(5);
      const orgs = await getFakeOrgs();

      const teamId = String(users.owner.teamId);
      // 用 app 作为 resourceType 占位：查询形状/索引/位过滤与 collection 完全一致（同表同构），
      // 且避免 main 的 enum 里尚无 collection 的校验限制；实测差异同样适用于 collection 列表查询
      const RESOURCE_TYPE = PER;

      const memberPool = users.members.map((m) => m.tmbId);
      const groupPool = groups.map((g) => String(g._id));
      const orgPool = orgs.map((o) => String(o._id));
      // 拒绝记录用的分组 id 无需真实落库（查询只做 resource_permissions 上的字符串匹配）
      const denyGroupId = String(new Types.ObjectId());

      // 查询者：member1，命中组 group[0]、组织 org[0]
      const [queryTmbId] = memberPool;
      const queryGroupIds = [groupPool[0]];
      const queryOrgIds = [orgPool[0]];

      const RESOURCE_COUNT = 10000;
      // 每资源 5 行：owner 全位 + group[i%5] read + org[(i+1)%5] read + 两成员 write/manage
      // 命中查询者 = i%4∈{0,2}(成员行) ∪ i%5==0(group) ∪ i%5==4(org)；
      // 未命中残差 = i%20 ∈ {1,3,7,11,13,17}（共 3000 个）
      const RESIDUES = new Set([1, 3, 7, 11, 13, 17]);
      const resourceIds = Array.from({ length: RESOURCE_COUNT }, () => new Types.ObjectId());
      const rows: Record<string, unknown>[] = [];
      const noMatchIdx: number[] = [];

      for (let i = 0; i < RESOURCE_COUNT; i++) {
        const resourceId = resourceIds[i];
        rows.push(
          {
            teamId,
            resourceType: RESOURCE_TYPE,
            resourceId,
            tmbId: users.owner.tmbId,
            permission: OwnerRoleVal
          },
          {
            teamId,
            resourceType: RESOURCE_TYPE,
            resourceId,
            groupId: groupPool[i % 5],
            permission: ReadRoleVal
          },
          {
            teamId,
            resourceType: RESOURCE_TYPE,
            resourceId,
            orgId: orgPool[(i + 1) % 5],
            permission: ReadRoleVal
          },
          {
            teamId,
            resourceType: RESOURCE_TYPE,
            resourceId,
            tmbId: memberPool[i % 4],
            permission: WriteRoleVal
          },
          {
            teamId,
            resourceType: RESOURCE_TYPE,
            resourceId,
            tmbId: memberPool[(i + 2) % 4],
            permission: ManageRoleVal
          }
        );
        if (RESIDUES.has(i % 20)) noMatchIdx.push(i);
      }
      expect(noMatchIdx.length).toBe(3000);
      // 未命中资源各注入一条"唯一命中"的拒绝记录（permission: 0），验证 $bitsAnySet 的排除作用
      noMatchIdx.forEach((i) =>
        rows.push({
          teamId,
          resourceType: RESOURCE_TYPE,
          resourceId: resourceIds[i],
          groupId: denyGroupId,
          permission: 0
        })
      );

      // setup（不记时）：分批插入 5w + 3k 行
      for (let i = 0; i < rows.length; i += 2000) {
        await MongoResourcePermission.insertMany(rows.slice(i, i + 2000));
      }
      const totalRows = await MongoResourcePermission.countDocuments({
        teamId,
        resourceType: RESOURCE_TYPE
      });
      expect(totalRows).toBe(RESOURCE_COUNT * 5 + noMatchIdx.length);

      // 复刻 buildPermissionQuery，唯一变量是 `permission: { $bitsAnySet: 0b111 }` 有无
      const baseQuery = (groupIds: string[], withBitsFilter: boolean) => ({
        resourceType: RESOURCE_TYPE,
        teamId,
        resourceId: { $in: resourceIds },
        ...(withBitsFilter ? { permission: { $bitsAnySet: 0b111 } } : {}),
        $or: [
          { tmbId: queryTmbId },
          ...(groupIds.length ? [{ groupId: { $in: groupIds } }] : []),
          ...(queryOrgIds.length ? [{ orgId: { $in: queryOrgIds } }] : [])
        ]
      });

      const distinctCount = async (q: Record<string, unknown>) => {
        const ids = await MongoResourcePermission.distinct('resourceId', q);
        return (ids as unknown[]).length;
      };

      const measure = async ({
        label,
        groupIds,
        expectWith,
        expectWithout
      }: {
        label: string;
        groupIds: string[];
        expectWith: number;
        expectWithout: number;
      }) => {
        // 预热（丢弃），避免首次编译/缓存倾斜
        await distinctCount(baseQuery(groupIds, true));
        await distinctCount(baseQuery(groupIds, false));

        // 一次性 explain：对比两种查询的执行计划/扫描量（帮助解释耗时差异）
        const explainStats = async (q: Record<string, unknown>) => {
          const res = (await MongoResourcePermission.find(q).explain('executionStats')) as any;
          const s = res.executionStats;
          const win = res.queryPlanner.winningPlan;
          const firstStage = win.inputStage ??
            win.queryPlan?.inputStage ?? { stage: win.stage, indexName: 'collscan' };
          return {
            docsExamined: s.totalDocsExamined,
            keysExamined: s.totalKeysExamined,
            returned: s.nReturned,
            index: `${firstStage.stage}${firstStage.indexName ? `(${firstStage.indexName})` : ''}`
          };
        };
        const eWith = await explainStats(baseQuery(groupIds, true));
        const eWithout = await explainStats(baseQuery(groupIds, false));
        console.log(
          `\n  [${label}] explain executionStats (find 的 nReturned 含同资源多行，distinct 会去重为下方 count):`
        );
        console.log(
          `    with    → index=${eWith.index} keysExamined=${eWith.keysExamined} docsExamined=${eWith.docsExamined} nReturned=${eWith.returned}`
        );
        console.log(
          `    without → index=${eWithout.index} keysExamined=${eWithout.keysExamined} docsExamined=${eWithout.docsExamined} nReturned=${eWithout.returned}`
        );

        const ROUNDS = 5;
        const withTimes: number[] = [];
        const withoutTimes: number[] = [];
        let withCount = 0;
        let withoutCount = 0;
        for (let r = 0; r < ROUNDS; r++) {
          let t = performance.now();
          withCount = await distinctCount(baseQuery(groupIds, true));
          withTimes.push(performance.now() - t);

          t = performance.now();
          withoutCount = await distinctCount(baseQuery(groupIds, false));
          withoutTimes.push(performance.now() - t);
        }
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const min = (arr: number[]) => Math.min(...arr);

        expect(withCount).toBe(expectWith);
        expect(withoutCount).toBe(expectWithout);

        logBench(
          `supplement E · ${label}`,
          `10k resources / ${totalRows} ACL rows · distinct resourceId (5 rounds avg/min)`,
          avg(withTimes),
          `with    avg=${avg(withTimes).toFixed(1)}ms min=${min(withTimes).toFixed(1)} count=${withCount} | ` +
            `without avg=${avg(withoutTimes).toFixed(1)}ms min=${min(withoutTimes).toFixed(1)} count=${withoutCount}`
        );
        return { withTimes, withoutTimes };
      };

      const readable = RESOURCE_COUNT - noMatchIdx.length; // 7000
      const clean = await measure({
        label: 'clean (no deny rows)',
        groupIds: queryGroupIds,
        expectWith: readable,
        expectWithout: readable
      });
      const deny = await measure({
        label: 'deny rows present',
        groupIds: [...queryGroupIds, denyGroupId],
        expectWith: readable,
        expectWithout: RESOURCE_COUNT
      });

      const print = (l: string, arr: number[]) =>
        console.log(`    ${l}: [${arr.map((v) => v.toFixed(1)).join(', ')}] ms`);
      console.log('\n  rounds detail (with=有 $bitsAnySet, without=无):');
      print('clean  with   ', clean.withTimes);
      print('clean  without', clean.withoutTimes);
      print('deny   with   ', deny.withTimes);
      print('deny   without', deny.withoutTimes);
    }
  );
});
