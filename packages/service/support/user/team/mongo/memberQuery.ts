import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { Types } from '../../../../common/mongo';
import { MongoTeamMember } from '../teamMemberSchema';

/** 历史兼容状态（已弃用，仍保留等值索引分桶以消除 `$nin` 触发的阻塞 `SORT`）。 */
export const LEGACY_TEAM_MEMBER_WAITING_STATUS = 'waiting' as const;

/** 全部状态视图下的固定等值分组顺序：活跃 -> 离职 -> 停用 -> 历史待确认。 */
export const ORDERED_TEAM_MEMBER_STATUSES = [
  TeamMemberStatusEnum.active,
  TeamMemberStatusEnum.leave,
  TeamMemberStatusEnum.forbidden,
  LEGACY_TEAM_MEMBER_WAITING_STATUS
] as const;

/** 成员列表查询显式投影，仅拉取列表组装所需字段，不回传 `nameSortKey` 等内部字段。 */
export const TEAM_MEMBER_LIST_PROJECTION = {
  _id: 1,
  teamId: 1,
  userId: 1,
  name: 1,
  isSetMemberName: 1,
  role: 1,
  status: 1,
  avatar: 1,
  createTime: 1,
  updateTime: 1
} as const;

type MemberQueryFilter = Record<string, unknown>;

export type FindTeamMembersPageParams = {
  teamId: string;
  status?: TeamMemberStatusEnum;
  offset: number;
  pageSize: number;
  /** 置顶的当前成员 ID（支持合法的大小写 24 位十六进制 ObjectId）。 */
  pinnedTmbId?: string;
  /** 候选成员 ID 白名单（支持合法的大小写 24 位十六进制 ObjectId）；传空数组表示结果为空。 */
  matchedTmbIds?: string[];
  /** 非 root 视角下需排除的外来 root 用户 ID。 */
  excludeUserId?: string;
  /** 关键词搜索条件：匹配到的用户 ID 列表与成员名称正则。 */
  search?: {
    nameRegex: RegExp;
    matchedUserIds: string[];
  };
};

export type FindTeamMembersPageResult = {
  members: TeamMemberSchema[];
  total: number;
};

/** 将合法 ObjectId 字符串归一化为标准小写 24 位 hex，避免大小写混用导致求交/置顶/排除失配。 */
export const normalizeTeamMemberObjectIdHex = (id: unknown): string | undefined => {
  if (id === null || id === undefined) return undefined;
  const raw = String(id).trim();
  if (!Types.ObjectId.isValid(raw)) return undefined;
  return String(new Types.ObjectId(raw));
};

const normalizeObjectIdList = (ids: readonly unknown[]): string[] => {
  const unique = new Set<string>();
  for (const id of ids) {
    const normalized = normalizeTeamMemberObjectIdHex(id);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
};

const buildMemberIdFilter = ({
  matchedTmbIds,
  excludeTmbId
}: {
  matchedTmbIds?: string[];
  excludeTmbId?: string;
}): { empty: true } | { empty: false; filter: MemberQueryFilter } => {
  if (matchedTmbIds && excludeTmbId) {
    const remainingIds = matchedTmbIds.filter((id) => id !== excludeTmbId);
    if (remainingIds.length === 0) {
      return { empty: true };
    }
    return {
      empty: false,
      filter: { _id: { $in: remainingIds.map((id) => new Types.ObjectId(id)) } }
    };
  }
  if (matchedTmbIds) {
    return {
      empty: false,
      filter: { _id: { $in: matchedTmbIds.map((id) => new Types.ObjectId(id)) } }
    };
  }
  if (excludeTmbId) {
    return {
      empty: false,
      filter: { _id: { $ne: new Types.ObjectId(excludeTmbId) } }
    };
  }
  return { empty: false, filter: {} };
};

/**
 * 基于复合索引 `fg_team_member_status_sort` 做 O(1) 探测：检查当前查询范围内是否仍有未回填 `nameSortKey` 的存量文档。
 * MongoDB 升序中 missing/null 小于任意字符串，后台迁移尚未完成前暂退回 `_id` 顺序，避免未迁移记录被顶到最前。
 */
export const hasUnmigratedTeamMemberSortKey = async ({
  teamObjectId,
  status
}: {
  teamObjectId: Types.ObjectId;
  status?: TeamMemberStatusEnum;
}): Promise<boolean> => {
  if (status) {
    return Boolean(
      await MongoTeamMember.exists({
        teamId: teamObjectId,
        status,
        nameSortKey: null
      })
    );
  }

  const probes = await Promise.all([
    ...ORDERED_TEAM_MEMBER_STATUSES.map((item) =>
      MongoTeamMember.exists({
        teamId: teamObjectId,
        status: item,
        nameSortKey: null
      })
    ),
    MongoTeamMember.exists({
      teamId: teamObjectId,
      status: { $nin: [...ORDERED_TEAM_MEMBER_STATUSES] },
      nameSortKey: null
    })
  ]);
  return probes.some(Boolean);
};

/**
 * 基于复合索引 `fg_team_member_status_sort`（teamId, status, nameSortKey, _id）执行团队成员分页查询。
 * - 所有已知业务状态及历史兼容 `waiting` 状态均采用等值分桶，避免 `$nin` 触发阻塞 `SORT`。
 * - 计数与取数共用同一排除置顶成员 ID 的谓词，避免置顶成员在读取后并发变更状态导致分桶扣减错位与漏项。
 */
export const findTeamMembersPage = async ({
  teamId,
  status,
  offset,
  pageSize,
  pinnedTmbId,
  matchedTmbIds,
  excludeUserId,
  search
}: FindTeamMembersPageParams): Promise<FindTeamMembersPageResult> => {
  const normalizedMatchedIds =
    matchedTmbIds !== undefined ? normalizeObjectIdList(matchedTmbIds) : undefined;
  if (normalizedMatchedIds && normalizedMatchedIds.length === 0) {
    return { members: [], total: 0 };
  }

  const teamObjectId = new Types.ObjectId(teamId);
  const sharedFilter: MemberQueryFilter = {
    teamId: teamObjectId,
    ...(excludeUserId ? { userId: { $ne: new Types.ObjectId(excludeUserId) } } : {}),
    ...(search
      ? {
          $or: [
            ...(search.matchedUserIds.length > 0
              ? [
                  {
                    userId: {
                      $in: search.matchedUserIds.map((id) => new Types.ObjectId(id))
                    }
                  }
                ]
              : []),
            { name: search.nameRegex }
          ]
        }
      : {})
  };

  // 1. 探测当前范围是否存在未迁移记录，并按需定位置顶的当前成员。
  const normalizedPinnedId = normalizeTeamMemberObjectIdHex(pinnedTmbId);
  const canMatchPinned =
    Boolean(normalizedPinnedId) &&
    (!normalizedMatchedIds || normalizedMatchedIds.includes(normalizedPinnedId!));

  const [unmigrated, pinnedMember] = await Promise.all([
    hasUnmigratedTeamMemberSortKey({ teamObjectId, status }),
    canMatchPinned
      ? MongoTeamMember.findOne(
          {
            ...sharedFilter,
            ...(status ? { status } : {}),
            _id: new Types.ObjectId(normalizedPinnedId)
          },
          TEAM_MEMBER_LIST_PROJECTION
        ).lean<TeamMemberSchema>()
      : Promise.resolve(null)
  ]);

  const pinnedIdHex = pinnedMember ? normalizeTeamMemberObjectIdHex(pinnedMember._id) : undefined;
  const sortSpec: Record<string, 1> = unmigrated ? { _id: 1 } : { nameSortKey: 1, _id: 1 };
  const pinnedPrefix = pinnedMember && offset === 0 && pageSize > 0 ? [pinnedMember] : [];
  const remainingOffset = pinnedMember ? Math.max(0, offset - 1) : offset;
  const remainingLimit = Math.max(0, pageSize - pinnedPrefix.length);

  const remainingIdFilter = buildMemberIdFilter({
    matchedTmbIds: normalizedMatchedIds,
    excludeTmbId: pinnedIdHex
  });

  if (remainingIdFilter.empty) {
    return {
      members: pinnedPrefix,
      total: pinnedMember ? 1 : 0
    };
  }

  // 计数与取数共用同一 `remainingBase` 谓词，按 `_id` 排除已置顶成员，确保并发状态变更时不产生口径漂移。
  const remainingBase: MemberQueryFilter = {
    ...sharedFilter,
    ...remainingIdFilter.filter
  };

  // 2. 单状态查询直接命中复合索引 (teamId, status, nameSortKey, _id)。
  if (status) {
    const match = { ...remainingBase, status };
    const [remainingTotal, remainingDocs] = await Promise.all([
      MongoTeamMember.countDocuments(match),
      remainingLimit > 0
        ? MongoTeamMember.find(match, TEAM_MEMBER_LIST_PROJECTION)
            .sort(sortSpec)
            .skip(remainingOffset)
            .limit(remainingLimit)
            .lean<TeamMemberSchema[]>()
        : Promise.resolve([])
    ]);
    return {
      members: [...pinnedPrefix, ...remainingDocs],
      total: remainingTotal + (pinnedMember ? 1 : 0)
    };
  }

  // 3. 全部状态视图按 active -> leave -> forbidden -> waiting -> 其他 等值分桶计数，仅查询命中的 1~2 个桶。
  const bucketMatches: MemberQueryFilter[] = [
    ...ORDERED_TEAM_MEMBER_STATUSES.map((item) => ({ ...remainingBase, status: item })),
    { ...remainingBase, status: { $nin: [...ORDERED_TEAM_MEMBER_STATUSES] } }
  ];
  const bucketCounts = await Promise.all(
    bucketMatches.map((match) => MongoTeamMember.countDocuments(match))
  );
  const remainingTotal = bucketCounts.reduce((sum, count) => sum + count, 0);

  const bucketQueries: Promise<TeamMemberSchema[]>[] = [];
  let cursor = 0;
  let needed = remainingLimit;
  for (let i = 0; i < bucketMatches.length; i++) {
    const count = bucketCounts[i];
    if (needed <= 0 || count === 0) {
      cursor += count;
      continue;
    }
    if (remainingOffset >= cursor + count) {
      cursor += count;
      continue;
    }

    const skipInBucket = Math.max(0, remainingOffset - cursor);
    const limitInBucket = Math.min(needed, count - skipInBucket);
    bucketQueries.push(
      MongoTeamMember.find(bucketMatches[i], TEAM_MEMBER_LIST_PROJECTION)
        .sort(sortSpec)
        .skip(skipInBucket)
        .limit(limitInBucket)
        .lean<TeamMemberSchema[]>()
    );
    needed -= limitInBucket;
    cursor += count;
  }

  const bucketDocs = bucketQueries.length > 0 ? (await Promise.all(bucketQueries)).flat() : [];
  return {
    members: [...pinnedPrefix, ...bucketDocs],
    total: remainingTotal + (pinnedMember ? 1 : 0)
  };
};
