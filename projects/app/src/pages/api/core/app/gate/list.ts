import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { concatPer } from '@fastgpt/service/support/permission/controller';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

export type ListGateAppBody = {
  parentId?: ParentIdType;
  searchKey?: string;
};

async function handler(req: ApiRequestProps<ListGateAppBody>): Promise<AppListItemType[]> {
  const { parentId, searchKey } = req.body;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    })
  ]);

  // Get team all app permissions
  const [perList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
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
  // Get my permissions
  const myPerList = perList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  // Filter apps by permission, if not owner, only get apps that I have permission to access
  const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
  const appPerQuery = teamPer.isOwner
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
          { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
        ]
      }
    : {};

  const findAppsQuery = {
    ...appPerQuery,
    teamId,
    ...searchMatch,
    type: AppTypeEnum.gate, // 仅获取 gate 类型
    ...parseParentIdInMongo(parentId)
  };

  const limit = searchKey ? 20 : 1000;

  const myApps = await MongoApp.find(
    findAppsQuery,
    '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission'
  )
    .sort({
      updateTime: -1
    })
    .limit(limit)
    .lean();

  // Add app permission and filter apps by read permission
  const formatApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        const getPer = (appId: string) => {
          const tmbPer = myPerList.find(
            (item) => String(item.resourceId) === appId && !!item.tmbId
          )?.permission;
          const groupPer = concatPer(
            myPerList
              .filter(
                (item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );

          return new AppPermission({
            per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
            isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };

        const getClbCount = (appId: string) => {
          return perList.filter((item) => String(item.resourceId) === String(appId)).length;
        };

        // Check parent folder clb
        if (app.parentId && app.inheritPermission) {
          return {
            Per: getPer(String(app.parentId)),
            privateApp: getClbCount(String(app.parentId)) <= 1
          };
        }

        return {
          Per: getPer(String(app._id)),
          privateApp: getClbCount(String(app._id)) === 0
        };
      })();

      return {
        ...app,
        permission: Per,
        private: privateApp
      };
    })
    .filter((app) => app.permission.hasReadPer);

  return addSourceMember({
    list: formatApps
  });
}

export default NextAPI(handler);
