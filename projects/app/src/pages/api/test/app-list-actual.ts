import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, type AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { concatPer } from '@fastgpt/service/support/permission/controller';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

type ListAppBody = {
  parentId?: ParentIdType;
  type?: AppTypeEnum | AppTypeEnum[];
  searchKey?: string;
  getRecentlyChat?: boolean;
};

async function handler(req: ApiRequestProps<ListAppBody>, res: NextApiResponse<any>): Promise<any> {
  const { parentId, type, getRecentlyChat, searchKey } = req.body;

  console.log('=== Actual App List API Debug ===');
  console.log('Request body:', { parentId, type, getRecentlyChat, searchKey });

  try {
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
            authApp({
              req,
              authToken: true,
              authApiKey: true,
              appId: parentId,
              per: ReadPermissionVal
            })
          ]
        : [])
    ]);

    console.log('Auth result:', { tmbId, teamId, teamPer: teamPer.value });

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

    console.log(`Found ${perList.length} permission records for team`);

    // Get my permissions
    const myPerList = perList.filter(
      (item) =>
        String(item.tmbId) === String(tmbId) ||
        myGroupMap.has(String(item.groupId)) ||
        myOrgSet.has(String(item.orgId))
    );

    console.log(`User has ${myPerList.length} relevant permissions`);

    // Build query
    const findAppsQuery = (() => {
      const appPerQuery = (() => {
        if (teamPer.isOwner) {
          console.log('User is team owner, can see all apps');
          return {};
        }

        const appIds = myPerList.map((item) => String(item.resourceId));
        console.log(`User can access ${appIds.length} specific apps:`, appIds);
        return {
          _id: { $in: appIds }
        };
      })();

      const searchMatch = (() => {
        if (!searchKey) return {};
        const regex = new RegExp(replaceRegChars(searchKey), 'i');
        return {
          $or: [{ name: regex }, { intro: regex }]
        };
      })();

      return {
        ...appPerQuery,
        teamId,
        ...(type && (Array.isArray(type) ? { type: { $in: type } } : { type })),
        ...parseParentIdInMongo(parentId),
        ...searchMatch
      };
    })();

    console.log('Final query:', JSON.stringify(findAppsQuery, null, 2));

    const limit = (() => {
      if (getRecentlyChat) return 15;
      if (searchKey) return 50;
      return;
    })();

    const myApps = await MongoApp.find(
      findAppsQuery,
      '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission',
      {
        limit: limit
      }
    )
      .sort({
        updateTime: -1
      })
      .lean();

    console.log(`Query returned ${myApps.length} apps before permission filtering:`);
    myApps.forEach((app, index) => {
      console.log(
        `  ${index + 1}. ${app.name} (${app._id}) - type: ${app.type}, tmbId: ${app.tmbId}`
      );
    });

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

          // Inherit app, check parent folder clb
          if (!AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission) {
            return {
              Per: getPer(String(app.parentId)),
              privateApp: getClbCount(String(app.parentId)) <= 1
            };
          }

          return {
            Per: getPer(String(app._id)),
            privateApp: AppFolderTypeList.includes(app.type)
              ? getClbCount(String(app._id)) <= 1
              : getClbCount(String(app._id)) === 0
          };
        })();

        const hasReadPer = Per.hasReadPer;
        console.log(
          `App ${app.name}: hasReadPer=${hasReadPer}, isOwner=${Per.isOwner}, permission=${Per.value}`
        );

        return {
          ...app,
          permission: Per,
          private: privateApp,
          hasReadPer
        };
      })
      .filter((app) => app.permission.hasReadPer);

    console.log(`Final result: ${formatApps.length} apps after permission filtering`);

    const result = await addSourceMember({
      list: formatApps
    });

    return jsonRes(res, {
      data: {
        debug: {
          auth: { tmbId, teamId, teamPer: teamPer.value },
          query: findAppsQuery,
          rawApps: myApps.length,
          filteredApps: formatApps.length,
          finalApps: result.length
        },
        apps: result
      }
    });
  } catch (err: any) {
    console.error('Actual app list debug error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error',
      error: {
        stack: err.stack,
        name: err.name
      }
    });
  }
}

export default NextAPI(handler);
