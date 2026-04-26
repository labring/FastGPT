/**
 * getCollectionTmbPermission 正交核心测试用例
 *
 * 正交因子：
 *   A. Collection 类型：folder | file（非 folder）
 *   B. inheritPermission：true（继承）| false（独立）
 *   C. 父级类型：无父级（数据集） | folder collection
 *   D. 请求权限（per）：ReadPermissionVal | WritePermissionVal | ManagePermissionVal
 *
 * 关键决策分支（来自 getCollectionTmbPermission 实现）：
 *   1. isOwner 短路（collection 创建者 or 团队 owner）
 *   2. hasIndependentPermission = inheritPermission===false OR type===folder
 *      → 仅查自身 resource_permissions
 *   3. inheritPermission=true + parentId → 递归查父级 collection
 *   4. inheritPermission=true + 无 parentId → 从 dataset 继承
 *   5. 父级权限 sumPer 自身权限作为最终 role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  ReadPermissionVal,
  WritePermissionVal,
  ManagePermissionVal,
  NullRoleVal,
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

// ─── mock 底层依赖 ──────────────────────────────────────────────────────────
vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: vi.fn()
}));

vi.mock(import('@fastgpt/service/core/dataset/collection/schema'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    MongoDatasetCollection: { findOne: vi.fn() }
  };
});

vi.mock(import('@fastgpt/service/core/dataset/schema'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    MongoDataset: { findOne: vi.fn() }
  };
});

// ─── 被测函数 ───────────────────────────────────────────────────────────────
import { getCollectionTmbPermission } from '@fastgpt/service/support/permission/dataset/auth';

// ─── mock 引用（在 vi.mock 之后 import）────────────────────────────────────
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getTmbPermission } from '@fastgpt/service/support/permission/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

// ─── 辅助 ───────────────────────────────────────────────────────────────────
const newId = () => String(new Types.ObjectId());

/** 普通成员（非 owner）的 tmbInfo mock */
const normalMemberInfo = (teamId: string) => ({
  teamId,
  permission: { isOwner: false }
});

/** 构造最小 collection 对象 */
function makeCollection(opts: {
  id?: string;
  tmbId?: string;
  datasetId?: string;
  parentId?: string | null;
  inheritPermission?: boolean;
  type?: DatasetCollectionTypeEnum;
}) {
  return {
    _id: opts.id ?? newId(),
    tmbId: opts.tmbId ?? newId(),
    datasetId: opts.datasetId ?? newId(),
    parentId: opts.parentId ?? null,
    inheritPermission: opts.inheritPermission ?? true,
    type: opts.type ?? DatasetCollectionTypeEnum.file
  };
}

/** 构造 MongoDataset.findOne 返回值（只需 _id/tmbId/teamId/parentId/inheritPermission/type） */
function makeDataset(teamId: string, tmbId: string) {
  return {
    _id: newId(),
    tmbId,
    teamId,
    parentId: null,
    inheritPermission: false, // dataset 本身不涉及 inheritPermission 逻辑
    type: DatasetTypeEnum.dataset
  };
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────
describe('getCollectionTmbPermission - 正交核心测试', () => {
  const teamId = newId();
  const tmbId = newId();
  const otherTmbId = newId(); // collection 创建者（非当前用户）

  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：普通成员，非团队 owner
    vi.mocked(getTmbInfoByTmbId).mockResolvedValue(normalMemberInfo(teamId) as any);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-01: folder + 成员有 ReadRole → 仅用 collection 自身权限，可读不可写
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-01 folder类型始终走独立权限，有ReadRole可读不可写', async () => {
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder
    });
    vi.mocked(getTmbPermission).mockResolvedValue(ReadRoleVal);

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(false);
    expect(perm.hasManagePer).toBe(false);
    // 验证只查了一次 collection 权限，未查 parentId
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-02: folder + 成员无权限 → 拒绝读取
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-02 folder类型无授权则无任何权限', async () => {
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder
    });
    vi.mocked(getTmbPermission).mockResolvedValue(undefined); // 无 clb 记录

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(false);
    expect(perm.hasWritePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-03: file + inheritPermission=false + 有 WriteRole → 可写不可管理
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-03 file独立权限(inheritPermission=false)有WriteRole可写不可管理', async () => {
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: false
    });
    vi.mocked(getTmbPermission).mockResolvedValue(WriteRoleVal);

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true); // Write 角色包含 Read 权限
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(false);
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-04: file + inheritPermission=false + 无直接权限 → 拒绝（忽略父级数据集权限）
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-04 file独立权限(inheritPermission=false)无直接授权则拒绝，忽略数据集权限', async () => {
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: false
    });
    // 无 clb 记录（但假设数据集层有权限，独立模式应忽略）
    vi.mocked(getTmbPermission).mockResolvedValue(undefined);

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(false);
    // 不应触发数据集查询
    expect(vi.mocked(MongoDataset.findOne)).not.toHaveBeenCalled();
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-05: file + inheritPermission=true + 无 parentId + 数据集有 ReadRole → 可读
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-05 file继承(inheritPermission=true)无父Collection，从数据集继承ReadRole', async () => {
    const datasetId = newId();
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: null,
      datasetId
    });

    // authDatasetByTmbId → MongoDataset.findOne
    const ds = makeDataset(teamId, otherTmbId);
    vi.mocked(MongoDataset.findOne).mockReturnValue({ lean: () => Promise.resolve(ds) } as any);

    // getTmbPermission: dataset 层 → ReadRoleVal；collection 层 → undefined
    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceType }) => {
      if (resourceType === PerResourceTypeEnum.dataset) return ReadRoleVal;
      return undefined; // collection 本身无额外 clb
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-06: file + inheritPermission=true + 无 parentId + 数据集无权限 → 拒绝
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-06 file继承(inheritPermission=true)无父Collection，数据集无授权则拒绝', async () => {
    const datasetId = newId();
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: null,
      datasetId
    });

    const ds = makeDataset(teamId, otherTmbId);
    vi.mocked(MongoDataset.findOne).mockReturnValue({ lean: () => Promise.resolve(ds) } as any);
    // 数据集层和 collection 层均无权限
    vi.mocked(getTmbPermission).mockResolvedValue(undefined);

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(false);
    expect(perm.hasWritePer).toBe(false);
    expect(perm.hasManagePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-07: file + inheritPermission=true + parentId=folder + folder有 ManageRole → 可管理
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-07 file继承，父级为folder且有ManageRole，子级获得管理权限', async () => {
    const folderId = newId();
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: folderId
    });
    const parentFolder = makeCollection({
      id: folderId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder // folder 强制独立权限
    });

    vi.mocked(MongoDatasetCollection.findOne).mockReturnValue({
      lean: () => Promise.resolve(parentFolder)
    } as any);

    // folder 层的 collection 权限 → ManageRoleVal
    // child 层的 collection 权限 → undefined
    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceId }) => {
      if (String(resourceId) === String(folderId)) return ManageRoleVal;
      return undefined;
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-08: file + inheritPermission=true + parentId=folder(WriteRole) → 可写不可管理
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-08 file继承，父级folder有WriteRole，子级可写但不可管理', async () => {
    const folderId = newId();
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: folderId
    });
    const parentFolder = makeCollection({
      id: folderId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder
    });

    vi.mocked(MongoDatasetCollection.findOne).mockReturnValue({
      lean: () => Promise.resolve(parentFolder)
    } as any);

    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceId }) => {
      if (String(resourceId) === String(folderId)) return WriteRoleVal;
      return undefined; // child 无额外 clb
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true); // Write 包含 Read
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-09: 三级链继承：file→file(inherit)→dataset(WriteRole) → 末端可写
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-09 三级继承链：child→parentFile(inherit)→dataset(WriteRole)，child获得写权限', async () => {
    const datasetId = newId();
    const parentId = newId();

    const child = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId,
      datasetId
    });
    const parentFile = makeCollection({
      id: parentId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file, // 非 folder，inheritPermission=true → 再向上继承
      inheritPermission: true,
      parentId: null,
      datasetId
    });

    const ds = makeDataset(teamId, otherTmbId);
    vi.mocked(MongoDataset.findOne).mockReturnValue({ lean: () => Promise.resolve(ds) } as any);

    vi.mocked(MongoDatasetCollection.findOne).mockReturnValue({
      lean: () => Promise.resolve(parentFile)
    } as any);

    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceType }) => {
      if (resourceType === PerResourceTypeEnum.dataset) return WriteRoleVal;
      return undefined; // parent/child collection 无直接 clb
    });

    const perm = await getCollectionTmbPermission({ collection: child, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-10: Collection 创建者（tmbId 匹配）→ isOwner 短路，拥有完整权限
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-10 Collection创建者(tmbId匹配)无论类型和inheritPermission均为Owner，拥有全部权限', async () => {
    // tmbId 与当前操作用户相同 → isOwner=true
    const collection = makeCollection({
      tmbId, // 与请求用户相同
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: false // 即使独立权限模式也不影响 owner 判断
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.isOwner).toBe(true);
    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(true);
    // owner 短路：不应查询任何 resource_permissions
    expect(vi.mocked(getTmbPermission)).not.toHaveBeenCalled();
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Move 场景（移动后状态验证）
  // 移动操作会改变 parentId 和 inheritPermission，此处验证移动后 DB 状态下的有效权限
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // TC-11: Move + inheritParentPermission=true → 继承新父级(folderB, ManageRole) → 可管理
  // 模拟：file 从 folderA 移动到 folderB，inheritPermission=true，自身 clb 已被替换为父级 clbs
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-11 move后继承新父级folderB(ManageRole)，获得管理权限', async () => {
    const folderBId = newId();
    // 移动后状态：parentId=folderB, inheritPermission=true（已由 replaceResourceClbs 写入父级 clbs）
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: folderBId
    });
    const folderB = makeCollection({
      id: folderBId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder
    });

    vi.mocked(MongoDatasetCollection.findOne).mockReturnValue({
      lean: () => Promise.resolve(folderB)
    } as any);

    // folderB 有 ManageRole；collection 自身 clb 已被清除（move 后 replaceResourceClbs）
    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceId }) => {
      if (String(resourceId) === String(folderBId)) return ManageRoleVal;
      return undefined;
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-12: Move to root + inheritParentPermission=true → 继承 Dataset(ReadRole) → 仅可读
  // 模拟：file 移动到知识库根目录，inheritPermission=true，parentId=null
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-12 move到根目录后继承dataset(ReadRole)，仅可读不可写', async () => {
    const datasetId = newId();
    // 移动后状态：parentId=null, inheritPermission=true
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true,
      parentId: null,
      datasetId
    });

    const ds = makeDataset(teamId, otherTmbId);
    vi.mocked(MongoDataset.findOne).mockReturnValue({ lean: () => Promise.resolve(ds) } as any);

    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceType }) => {
      if (resourceType === PerResourceTypeEnum.dataset) return ReadRoleVal;
      return undefined;
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(false);
    expect(perm.hasManagePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-13: Move + inheritParentPermission=false → 保持独立权限，自身 WriteRole 有效
  // 模拟：移动时用户选择「保持独立权限」，inheritPermission=false，自身 clb 不变
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-13 move时保持独立权限(inheritParentPermission=false)，自身WriteRole依然有效', async () => {
    const newFolderId = newId();
    // 移动后状态：parentId 已变更，但 inheritPermission 保持 false（独立模式）
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: false,
      parentId: newFolderId // parentId 虽已变更，但独立模式不会查父级
    });

    // 自身保留 WriteRole；新父级有 ManageRole（但独立模式应忽略）
    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceId }) => {
      if (String(resourceId) === String(collection._id)) return WriteRoleVal;
      return ManageRoleVal; // 新父级权限，独立模式下不应生效
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(false); // 不继承新父级 ManageRole
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 恢复继承（Resume Inherit Permission）场景
  // resumeInheritPermission 对 file 清空自身 clbs + 置 inheritPermission=true；
  // 对 folder 替换为父级 clbs（folder 本身仍走独立权限路径）
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // TC-14: file 恢复继承 → inheritPermission=true，自身 clbs 已清空 → 从父级 folder(ReadRole) 继承
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-14 file恢复继承后自身clbs已清空，从父级folder(ReadRole)继承，原有WriteRole不再生效', async () => {
    const folderId = newId();
    // resumeInheritPermission 操作后状态：inheritPermission=true，自身 clbs 已删除
    const collection = makeCollection({
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.file,
      inheritPermission: true, // 恢复后置为 true
      parentId: folderId
    });
    const parentFolder = makeCollection({
      id: folderId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder
    });

    vi.mocked(MongoDatasetCollection.findOne).mockReturnValue({
      lean: () => Promise.resolve(parentFolder)
    } as any);

    // 父级 folder 有 ReadRole；collection 自身 clb=undefined（已被 deleteMany 清除）
    vi.mocked(getTmbPermission).mockImplementation(async ({ resourceId }) => {
      if (String(resourceId) === String(folderId)) return ReadRoleVal;
      return undefined; // 原有 WriteRole 已清除
    });

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(false); // 原有 Write clb 已被 resumeInheritPermission 清除
    expect(perm.hasManagePer).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-15: folder 恢复继承 → 自身 clbs 已被替换为父级 ManageRole → 可管理
  // folder 始终走独立权限路径，但 clbs 已由 resumeInheritPermission 替换为父级 clbs
  // ──────────────────────────────────────────────────────────────────────────
  it('TC-15 folder恢复继承后clbs替换为父级ManageRole，folder路径下可管理', async () => {
    const folderId = newId();
    // folder 恢复继承后：folder 本身 inheritPermission 字段不变（folder 始终独立）
    // 但其 resource_permissions 已被 replaceResourceClbs 替换为父级 clbs（ManageRole）
    const collection = makeCollection({
      id: folderId,
      tmbId: otherTmbId,
      type: DatasetCollectionTypeEnum.folder,
      inheritPermission: true // resumeInheritPermission 后会更新该字段
    });

    // folder 的独立权限路径：getTmbPermission → 经 replaceResourceClbs 替换后的 ManageRole
    vi.mocked(getTmbPermission).mockResolvedValue(ManageRoleVal);

    const perm = await getCollectionTmbPermission({ collection, teamId, tmbId });

    expect(perm.hasReadPer).toBe(true);
    expect(perm.hasWritePer).toBe(true);
    expect(perm.hasManagePer).toBe(true);
    // folder 不查父级 collection
    expect(vi.mocked(MongoDatasetCollection.findOne)).not.toHaveBeenCalled();
  });
});
