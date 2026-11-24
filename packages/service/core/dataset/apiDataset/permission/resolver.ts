import { MongoUser } from '../../../../support/user/schema';
import { MongoTeamMember } from '../../../../support/user/team/teamMemberSchema';
import { MongoMemberGroupModel } from '../../../../support/permission/memberGroup/memberGroupSchema';
import { MongoOrgModel } from '../../../../support/permission/org/orgSchema';
import { Types } from '../../../../common/mongo';
import {
  ManageRoleVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import type { ApiDatasetPermissionItemType } from '@fastgpt/global/core/dataset/apiDataset/type';

/**
 * 角色白名单。schema 已在 fetch 阶段挡掉非法 role，这里保留一道防线：
 * 本函数也接受内部构造的输入，绝不能把掩码值（如 7）写进 ACL。
 */
const VALID_ROLE_VALUES = new Set<number>([ReadRoleVal, WriteRoleVal, ManageRoleVal, OwnerRoleVal]);

/**
 * 角色强度：owner 最强，其次 manage(1) > write(2) > read(4)。
 * 角色值是位掩码，数值大小与强度恰好相反，不能直接比较数字。
 */
const ROLE_RANK = new Map<number, number>([
  [OwnerRoleVal, 4],
  [ManageRoleVal, 3],
  [WriteRoleVal, 2],
  [ReadRoleVal, 1]
]);
const getRoleRank = (permission: number) => ROLE_RANK.get(permission) ?? 0;

/** 外部传入的 id 不保证是合法 ObjectId；直接交给 Mongoose 会抛 CastError 让整轮失败。 */
const toObjectIds = (ids: Set<string>) =>
  Array.from(ids)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

/** 协作者唯一键：三类 subject 的 id 空间互不重叠，但仍按类型加前缀避免脏数据串号。 */
export const getPermissionSubjectKey = (collaborator: CollaboratorItemType) => {
  if ('tmbId' in collaborator && collaborator.tmbId) return `tmb:${collaborator.tmbId}`;
  if ('groupId' in collaborator && collaborator.groupId) return `group:${collaborator.groupId}`;
  if ('orgId' in collaborator && collaborator.orgId) return `org:${collaborator.orgId}`;
  return 'unknown';
};

/**
 * 把「文件 → 外部权限项」解析成「文件 → FastGPT 协作者」。
 *
 * 只做需要查库的解析，格式规则（主体四选一、role 合法）在 fetch 阶段已由 schema 完成。
 *
 * 步骤：
 * 1. 收集本轮出现的四类主体，各查一次库：
 *    - username 两跳：user.username → userId → 同团队 teamMember.tmbId；
 *      username 只在内存里流转，不落库、不打日志；跨团队同名用户天然解析失败。
 *    - tmbId / groupId / orgId：按 teamId 批量校验存在性。
 * 2. 逐条转换，解析不到的主体直接丢弃（已删除成员、别的团队的 id 都不会让整轮失败）。
 * 3. 同一文件内同一主体出现多次时取最强角色，避免写入顺序决定结果。
 *
 * 输入 `undefined` 表示外部未提供，输出原样保留 `undefined`（调用方据此跳过该节点）。
 */
export const resolveApiDatasetPermissionItems = async ({
  teamId,
  itemsByFileId
}: {
  teamId: string;
  itemsByFileId: Map<string, ApiDatasetPermissionItemType[] | undefined>;
}): Promise<Map<string, CollaboratorItemType[] | undefined>> => {
  const rawEntries = Array.from(itemsByFileId);
  const usernameSet = new Set<string>();
  const tmbIdSet = new Set<string>();
  const groupIdSet = new Set<string>();
  const orgIdSet = new Set<string>();

  for (const [, items] of rawEntries) {
    for (const item of items ?? []) {
      if (item.username) usernameSet.add(item.username);
      if (item.tmbId) tmbIdSet.add(item.tmbId);
      if (item.groupId) groupIdSet.add(item.groupId);
      if (item.orgId) orgIdSet.add(item.orgId);
    }
  }

  // 两跳解析 username：先取 userId，再限定在本团队内取 tmbId
  const usernameToTmbId = new Map<string, string>();
  if (usernameSet.size > 0) {
    const users = await MongoUser.find(
      { username: { $in: Array.from(usernameSet) } },
      'username'
    ).lean();
    const usernameByUserId = new Map(
      users.map((user) => [String(user._id), String(user.username)])
    );
    if (usernameByUserId.size > 0) {
      const teamMembers = await MongoTeamMember.find(
        { teamId, userId: { $in: Array.from(usernameByUserId.keys()) } },
        '_id userId'
      ).lean();
      for (const member of teamMembers) {
        const username = usernameByUserId.get(String(member.userId));
        if (username) usernameToTmbId.set(username, String(member._id));
      }
    }
  }

  const validTmbIds = new Set<string>(
    tmbIdSet.size > 0
      ? (
          await MongoTeamMember.find({ teamId, _id: { $in: toObjectIds(tmbIdSet) } }, '_id').lean()
        ).map((item) => String(item._id))
      : []
  );
  const validGroupIds = new Set<string>(
    groupIdSet.size > 0
      ? (
          await MongoMemberGroupModel.find(
            { teamId, _id: { $in: toObjectIds(groupIdSet) } },
            '_id'
          ).lean()
        ).map((item) => String(item._id))
      : []
  );
  const validOrgIds = new Set<string>(
    orgIdSet.size > 0
      ? (
          await MongoOrgModel.find({ teamId, _id: { $in: toObjectIds(orgIdSet) } }, '_id').lean()
        ).map((item) => String(item._id))
      : []
  );

  const result = new Map<string, CollaboratorItemType[] | undefined>();
  for (const [apiFileId, items] of rawEntries) {
    if (items === undefined) {
      result.set(apiFileId, undefined);
      continue;
    }

    const bySubject = new Map<string, CollaboratorItemType>();
    for (const item of items) {
      if (!VALID_ROLE_VALUES.has(item.permission)) continue;

      const collaborator: CollaboratorItemType | undefined = (() => {
        if (item.username) {
          const tmbId = usernameToTmbId.get(item.username);
          return tmbId ? { tmbId, permission: item.permission } : undefined;
        }
        if (item.tmbId) {
          return validTmbIds.has(item.tmbId)
            ? { tmbId: item.tmbId, permission: item.permission }
            : undefined;
        }
        if (item.groupId) {
          return validGroupIds.has(item.groupId)
            ? { groupId: item.groupId, permission: item.permission }
            : undefined;
        }
        if (item.orgId) {
          return validOrgIds.has(item.orgId)
            ? { orgId: item.orgId, permission: item.permission }
            : undefined;
        }
        return undefined;
      })();
      if (!collaborator) continue;

      const key = getPermissionSubjectKey(collaborator);
      const existing = bySubject.get(key);
      // 同一 subject 多次出现取最强角色，避免写入顺序决定结果
      if (!existing || getRoleRank(collaborator.permission) > getRoleRank(existing.permission)) {
        bySubject.set(key, collaborator);
      }
    }

    result.set(apiFileId, Array.from(bySubject.values()));
  }

  return result;
};

/**
 * 给目标 ACL 补上知识库 owner，返回新数组，不修改入参。
 *
 * 为什么要补：写入后节点是独立态，谁可见只取决于 ACL 行。
 * 外部漏配 owner，知识库 owner 就会看不到自己库里的文件。
 *
 * 三种情况按顺序判断：
 * 1. 列表里已经有 owner 行（owner 只能有一个主体）→ 原样返回；
 * 2. owner 自己在列表里但角色更低 → 原地把这一行提升为 owner
 *    （同一 subject 不能存两行 ACL）；
 * 3. owner 不在列表 → 追加一行 owner。
 */
export const ensureOwnerAccess = ({
  collaborators,
  ownerTmbId
}: {
  collaborators: CollaboratorItemType[];
  ownerTmbId: string;
}): CollaboratorItemType[] => {
  if (collaborators.some((item) => item.permission === OwnerRoleVal)) return collaborators;

  const ownerIndex = collaborators.findIndex(
    (item) => 'tmbId' in item && String(item.tmbId) === String(ownerTmbId)
  );
  if (ownerIndex >= 0) {
    const next = [...collaborators];
    next[ownerIndex] = { ...next[ownerIndex], permission: OwnerRoleVal };
    return next;
  }

  return [...collaborators, { tmbId: ownerTmbId, permission: OwnerRoleVal }];
};
