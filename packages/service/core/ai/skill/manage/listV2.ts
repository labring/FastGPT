import { Types } from '../../../../common/mongo';
import { MongoApp } from '../../../app/schema';
import { AppResourceRefsSkillIdsPath, buildAppSkillRefMongoQuery } from '../../../app/resourceRefs';
import { MongoAgentSkills } from '../model/schema';
import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import { readFromSecondary } from '../../../../common/mongo/utils';
import {
  getMyResourcePermission,
  buildReadableMatch,
  mergeMongoAndQuery,
  addSourceMemberV2,
  READABLE_IDS_LIMIT
} from '../../../../support/permission/resource/readable';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ListSkillsV2Query } from '@fastgpt/global/openapi/core/ai/skill/api';

type TeamPermission = {
  isOwner: boolean;
};

type ListReadableAgentSkillsV2Params = ListSkillsV2Query & {
  teamId: string;
  tmbId: string;
  teamPer: TeamPermission;
  pageSize: number;
  offset: number;
  creationStatus?: AgentSkillCreationStatusEnum;
};

/**
 * v2 技能列表页内实现。
 *
 * 权威语义 = 现有列表实现的最终可见集合（getPer + hasReadPer 过滤后）：
 * - source === 'store' 只去掉 teamId 条件，非 owner 仍应用权限谓词（perMatch = {} 仅限团队 owner）
 * - skillIds 分支同样应用权限谓词（以最终内存过滤为准，不复制旧超集写法）
 * - find 与 countDocuments 同一 match 常量 + 同一 readFromSecondary
 * 不动 manage/list.ts（被 ChatAgentHelper 复用的旧实现）。
 */
export const listReadableAgentSkillsV2 = async ({
  teamId,
  tmbId,
  teamPer,
  parentId,
  source,
  searchKey,
  category,
  type,
  skillIds,
  withAppCount,
  pageSize,
  offset,
  creationStatus
}: ListReadableAgentSkillsV2Params) => {
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;

  const { myPerList, roleListMap, readableDirectIds } = await getMyResourcePermission({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.agentSkill,
    createPermission: (role) => new SkillPermission({ role })
  });

  // 可读集合过大时拒绝请求（$in 数组过大会让查询与计数失控）；检查放 service 层是因为可读集合在此计算
  if (!teamPer.isOwner && readableDirectIds.length > READABLE_IDS_LIMIT) {
    return Promise.reject(CommonErrEnum.tooManyReadableResources);
  }

  // 页内 Per 计算用的角色 Map（与 manage/list.ts:99-126 同款构建）
  const myTmbRoleByResourceId = new Map<string, number>();
  const myGroupOrgRoleByResourceId = new Map<string, number>();
  myPerList.forEach((item) => {
    const resourceId = String(item.resourceId);
    if (item.tmbId) {
      myTmbRoleByResourceId.set(resourceId, item.permission);
    } else if (item.groupId || item.orgId) {
      const permissionList = myGroupOrgRoleByResourceId.get(resourceId);
      myGroupOrgRoleByResourceId.set(
        resourceId,
        permissionList === undefined ? item.permission : sumPer(permissionList, item.permission)!
      );
    }
  });

  const perMatch = teamPer.isOwner
    ? {}
    : buildReadableMatch({
        readableDirectIds,
        tmbId,
        folderTypeList: [AgentSkillTypeEnum.folder]
      });

  const findSkillQuery = (() => {
    const sourceQuery = (() => {
      if (source === 'store') return { source: AgentSkillSourceEnum.system };
      if (source === 'mine') return { source: AgentSkillSourceEnum.personal };
      return {};
    })();
    const typeQuery = {
      ...(category ? { category: { $in: [category] } } : {}),
      ...(type ? { type } : {})
    };
    const baseQuery = {
      deleteTime: null,
      ...sourceQuery,
      ...typeQuery,
      ...(creationStatus ? { creationStatus } : {})
    };
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { description: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (isSkillIdsQuery) {
      const scopeQuery = source
        ? source === 'store'
          ? {}
          : { teamId }
        : {
            $or: [{ teamId }, { source: AgentSkillSourceEnum.system }]
          };

      return mergeMongoAndQuery(
        baseQuery,
        scopeQuery,
        perMatch,
        {
          _id: { $in: selectedSkillIds }
        },
        searchMatch
      );
    }

    const teamIdQuery = source === 'store' ? {} : { teamId };

    if (searchKey) {
      return mergeMongoAndQuery(perMatch, teamIdQuery, baseQuery, searchMatch);
    }

    return mergeMongoAndQuery(perMatch, teamIdQuery, baseQuery, parseParentIdInMongo(parentId));
  })();

  const [mySkills, total] = await Promise.all([
    MongoAgentSkills.find(findSkillQuery, undefined, { ...readFromSecondary })
      .sort({ updateTime: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoAgentSkills.countDocuments(findSkillQuery, { ...readFromSecondary })
  ]);

  const formatSkills = mySkills.map((skill) => {
    const { Per, privateSkill } = (() => {
      const getPer = (skillId: string) => {
        const tmbRole = myTmbRoleByResourceId.get(skillId);
        const groupAndOrgRole = myGroupOrgRoleByResourceId.get(skillId);
        return new SkillPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(skill.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };

      if (skill.inheritPermission && skill.parentId && skill.type !== AgentSkillTypeEnum.folder) {
        const resourceClbs = roleListMap.get(String(skill._id)) ?? [];
        const parentClbs = roleListMap.get(String(skill.parentId)) ?? [];

        return {
          Per: getPer(String(skill.parentId)).addRole(getPer(String(skill._id)).role),
          privateSkill: isPrivateResourceByCollaborators({
            resourceClbs,
            parentClbs,
            inheritPermission: true
          })
        };
      }

      const resourceClbs = roleListMap.get(String(skill._id)) ?? [];

      return {
        Per: getPer(String(skill._id)),
        privateSkill: isPrivateResourceByCollaborators({
          resourceClbs
        })
      };
    })();

    return {
      _id: String(skill._id),
      avatar: skill.avatar,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      source: skill.source,
      category: skill.category,
      inheritPermission: skill.inheritPermission,
      currentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : undefined,
      creationStatus: skill.creationStatus,
      tmbId: skill.tmbId ? String(skill.tmbId) : null,
      parentId: skill.parentId ? String(skill.parentId) : null,
      createTime: skill.createTime,
      updateTime: skill.updateTime,
      permission: Per,
      private: privateSkill
    };
  });

  // 谓词等价性防御：命中谓词外资源说明权限谓词回归，仅告警不改结果
  const invalidSkill = formatSkills.find((skill) => !skill.permission.hasReadPer);
  if (invalidSkill) {
    console.warn('[listV2] skill 命中权限谓词外资源（谓词回归？）', invalidSkill._id);
  }

  const nonFolderSkills =
    withAppCount !== false ? formatSkills.filter((s) => s.type !== AgentSkillTypeEnum.folder) : [];
  const appCountMap = new Map<string, number>();
  if (nonFolderSkills.length > 0) {
    const skillIdStrings = nonFolderSkills.map((skill) => String(skill._id));
    const counts = await MongoApp.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: new Types.ObjectId(String(teamId)),
          deleteTime: null,
          ...buildAppSkillRefMongoQuery(skillIdStrings)
        }
      },
      { $unwind: `$${AppResourceRefsSkillIdsPath}` },
      { $match: buildAppSkillRefMongoQuery(skillIdStrings) },
      {
        $group: {
          _id: `$${AppResourceRefsSkillIdsPath}`,
          count: { $sum: 1 }
        }
      }
    ]);
    counts.forEach((item) => {
      appCountMap.set(String(item._id), item.count);
    });
  }

  const listWithAppCount = formatSkills.map((skill) => ({
    ...skill,
    appCount: appCountMap.get(skill._id) ?? 0
  }));

  const list = await addSourceMemberV2({ list: listWithAppCount });

  return { list, total };
};
