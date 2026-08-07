import { MongoResourcePermission } from '../schema';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../org/controllers';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  PermissionValueType,
  ResourcePermissionType
} from '@fastgpt/global/support/permission/type';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';

/**
 * v2 list 接口共享权限 helper。
 *
 * 只被 v2 路由引用；旧路由与旧 service 文件保持零改动。
 */

/** 可读资源 id 超过该数量时拒绝列表请求（$in 数组过大时查询与计数会失控）；阈值需预生产实测校准 */
export const READABLE_IDS_LIMIT = 10000;

export type MyResourcePermissionResult = {
  /** 我相关的权限记录（tmbId 是我 / groupId ∈ 我的组 / orgId ∈ 我的组织），语义与旧列表实现相同 */
  myPerList: ResourcePermissionType[];
  /** 按 resourceId 分组的团队全量权限记录（供页内 Per/private 计算） */
  roleListMap: Map<string, ResourcePermissionType[]>;
  /** 出现过任意权限记录的 resourceId（含 permission=0 记录）。注意：有记录不等于可读，见 readableDirectIds */
  anyRecordedIds: string[];
  /** 当前成员直接可读（角色位含 read）的资源 id 集合 */
  readableDirectIds: string[];
};

/**
 * 拉取团队级权限记录 + 成员组/组织展开，并计算直接可读集合。
 *
 * readableDirectIds 判定必须复用资源类型对应的 Permission 类（createPermission 分派）：
 * app 有 readChatLog 等额外角色映射，不能假定通用映射；且需保留 `tmbRole ?? groupAndOrgRole`
 * 的 `??` 语义与 undefined 中间值（个人直授 permission=0 时压过组/组织角色，不回落）。
 */
export const getMyResourcePermission = async ({
  teamId,
  tmbId,
  resourceType,
  createPermission
}: {
  teamId: string;
  tmbId: string;
  resourceType: PerResourceTypeEnum;
  createPermission: (role?: PermissionValueType) => Permission;
}): Promise<MyResourcePermissionResult> => {
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);

  const roleListMap = new Map<string, ResourcePermissionType[]>();
  roleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });

  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const anyRecordedIds = Array.from(new Set(myPerList.map((item) => String(item.resourceId))));

  // 按 resourceId 聚合角色位：tmb 直授优先（?? 语义，permission=0 保留不回落），组/组织按位或
  const perAggByResourceId = new Map<
    string,
    { tmbRole?: PermissionValueType; groupOrgRoles: PermissionValueType[] }
  >();
  myPerList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const agg = perAggByResourceId.get(resourceId) ?? {
      groupOrgRoles: [] as PermissionValueType[]
    };
    if (item.tmbId) {
      agg.tmbRole = item.permission;
    }
    if (item.groupId || item.orgId) {
      agg.groupOrgRoles.push(item.permission);
    }
    perAggByResourceId.set(resourceId, agg);
  });

  const readableDirectIds: string[] = [];
  perAggByResourceId.forEach((agg, resourceId) => {
    const groupAndOrgRole = agg.groupOrgRoles.length > 0 ? sumPer(...agg.groupOrgRoles) : undefined;
    const per = createPermission(agg.tmbRole ?? groupAndOrgRole);
    if (per.hasReadPer) {
      readableDirectIds.push(resourceId);
    }
  });

  return {
    myPerList,
    roleListMap,
    anyRecordedIds,
    readableDirectIds
  };
};

/**
 * 构造非 owner 的权限谓词（$or 三分支）：
 * 1. 直接可读资源；2. 创建者（getPer isOwner 语义）；3. 一层继承（直接父可读 + inheritPermission + 非文件夹）。
 */
export const buildReadableMatch = ({
  readableDirectIds,
  tmbId,
  folderTypeList
}: {
  readableDirectIds: string[];
  tmbId: string;
  folderTypeList: string[];
}) => ({
  $or: [
    { _id: { $in: readableDirectIds } },
    { tmbId },
    {
      type: { $nin: folderTypeList },
      inheritPermission: true,
      parentId: { $in: readableDirectIds }
    }
  ]
});

/**
 * 多个过滤条件可能都包含 $or，用 $and 合并避免对象展开时覆盖同名键。
 * 与 packages/service/core/ai/skill/manage/list.ts 的本地函数同逻辑；
 * 本文件为 v2 专用新实现，旧文件 import 零改动。
 */
export const mergeMongoAndQuery = (...queries: Record<string, unknown>[]) => {
  const validQueries = queries.filter((query) => Object.keys(query).length > 0);

  if (validQueries.length === 0) return {};
  if (validQueries.length === 1) return validQueries[0];

  return {
    $and: validQueries
  };
};

export type SourceMemberV2Type = {
  name: string;
  avatar: string | null;
  status: TeamMemberStatusEnum | null;
};

/**
 * v2 页内 sourceMember 变体：
 * 不调用公共 addSourceMember（其对缺成员直接丢项），缺成员或 tmbId 为 null 时保留资源并输出占位
 * `{ name: '未知成员', avatar: null, status: null }`（不作虚假状态陈述）。
 */
export const addSourceMemberV2 = async <T extends { tmbId: string | null }>({
  list
}: {
  list: T[];
}): Promise<Array<T & { sourceMember: SourceMemberV2Type }>> => {
  if (!Array.isArray(list)) return [];

  const tmbIdList = list
    .map((item) => (item.tmbId ? String(item.tmbId) : undefined))
    .filter(Boolean);
  const tmbList = await MongoTeamMember.find(
    {
      _id: { $in: tmbIdList }
    },
    'tmbId name avatar status'
  ).lean();
  const tmbMap = new Map(tmbList.map((tmb) => [String(tmb._id), tmb]));

  return list.map((item) => {
    const tmb = item.tmbId ? tmbMap.get(String(item.tmbId)) : undefined;

    return {
      ...item,
      sourceMember: tmb
        ? {
            name: tmb.name,
            avatar: tmb.avatar ?? null,
            status: tmb.status ?? TeamMemberStatusEnum.active
          }
        : { name: '未知成员', avatar: null, status: null }
    };
  });
};
