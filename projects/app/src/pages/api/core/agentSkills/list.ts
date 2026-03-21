import { NextAPI } from '@/service/middleware/entry';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import {
  AgentSkillTypeEnum,
  type AgentSkillSourceEnum
} from '@fastgpt/global/core/agentSkills/constants';

export type GetSkillListBody = {
  parentId?: ParentIdType;
  source?: `${AgentSkillSourceEnum}`;
  searchKey?: string;
  category?: string;
};

async function handler(req: ApiRequestProps<GetSkillListBody>) {
  const { parentId, source, searchKey, category } = req.body;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId
      ? [
          authSkill({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            skillId: parentId
          })
        ]
      : [])
  ]);

  // Get team all skill permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.agentSkill,
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

  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const findSkillQuery = (() => {
    // Filter skills by permission, if not owner, only get skills that I have permission to access
    const idList = { _id: { $in: myRoles.map((item) => item.resourceId) } };
    const skillPerQuery = teamPer.isOwner
      ? {}
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };

    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { description: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (searchKey) {
      const data = {
        ...skillPerQuery,
        teamId,
        deleteTime: null,
        ...searchMatch,
        ...(source ? { source } : {}),
        ...(category ? { category: { $in: [category] } } : {})
      };
      // @ts-ignore
      delete data.parentId;
      return data;
    }

    return {
      ...skillPerQuery,
      teamId,
      deleteTime: null,
      ...(source ? { source } : {}),
      ...(category ? { category: { $in: [category] } } : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const mySkills = await MongoAgentSkills.find(findSkillQuery)
    .sort({
      type: -1, // Folders first
      updateTime: -1
    })
    .lean();

  const formatSkills = mySkills
    .map((skill) => {
      const { Per, privateSkill } = (() => {
        const getPer = (skillId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === skillId && !!item.tmbId
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === skillId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );
          return new SkillPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(skill.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };
        const getClbCount = (skillId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(skillId)).length;
        };

        // inherit
        if (skill.inheritPermission && skill.parentId && skill.type !== AgentSkillTypeEnum.folder) {
          return {
            Per: getPer(String(skill.parentId)).addRole(getPer(String(skill._id)).role),
            privateSkill: getClbCount(String(skill.parentId)) <= 1
          };
        }
        return {
          Per: getPer(String(skill._id)),
          privateSkill: getClbCount(String(skill._id)) <= 1
        };
      })();

      return {
        _id: skill._id,
        avatar: skill.avatar,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        source: skill.source,
        category: skill.category,
        author: skill.author,
        inheritPermission: skill.inheritPermission,
        tmbId: skill.tmbId,
        updateTime: skill.updateTime,
        permission: Per,
        private: privateSkill
      };
    })
    .filter((skill) => skill.permission.hasReadPer);

  return addSourceMember({
    list: formatSkills
  });
}

export default NextAPI(handler);
