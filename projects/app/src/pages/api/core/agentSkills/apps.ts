import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type {
  ListAppsBySkillIdQuery,
  AppsBySkillIdItem
} from '@fastgpt/global/core/agentSkills/api';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

async function handler(
  req: ApiRequestProps<unknown, ListAppsBySkillIdQuery>
): Promise<AppsBySkillIdItem[]> {
  const { skillId } = req.query;

  if (!skillId) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Fetch all app permission records under the team, along with the user's groups and orgs
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((items) => {
      const map = new Map<string, 1>();
      items.forEach((item) => map.set(String(item._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  // Compute the current user's permission list
  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  // Query apps whose modules contain the given skillId
  const apps = await MongoApp.find(
    {
      teamId,
      deleteTime: null,
      modules: {
        $elemMatch: {
          inputs: {
            $elemMatch: {
              key: NodeInputKeyEnum.skills,
              'value.skillId': skillId
            }
          }
        }
      }
    },
    '_id parentId avatar type name intro tmbId updateTime inheritPermission'
  )
    .sort({ updateTime: -1 })
    .lean();

  // Filter apps with read permission and resolve per-app permissions
  const formatApps = apps
    .map((app) => {
      const getPer = (appId: string) => {
        const tmbRole = myPerList.find(
          (item) => String(item.resourceId) === appId && !!item.tmbId
        )?.permission;
        const groupAndOrgRole = sumPer(
          ...myPerList
            .filter((item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId))
            .map((item) => item.permission)
        );
        return new AppPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };

      const Per = (() => {
        if (!AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission) {
          return getPer(String(app.parentId)).addRole(getPer(String(app._id)).role);
        }
        return getPer(String(app._id));
      })();

      return {
        _id: String(app._id),
        name: app.name,
        avatar: app.avatar,
        intro: app.intro,
        tmbId: String(app.tmbId),
        type: app.type,
        updateTime: app.updateTime,
        permission: Per
      };
    })
    .filter((app) => app.permission.hasReadPer)
    .map(({ permission: _permission, ...rest }) => rest);

  return addSourceMember({ list: formatApps });
}

export default NextAPI(handler);
