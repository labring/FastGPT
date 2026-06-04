import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../../../../support/permission/schema';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum, AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { getGroupsByTmbId } from '../../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../../support/permission/org/controllers';
import { MongoApp } from '../../schema';

/**
 * 获取用户级别的个人可用的工作流工具, 包括：
 * mcp 工具, http 工具, 工作流工具
 */
export const getUserAvaliableWorkflowTools = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  // Get team all app permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
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
  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const myApps: {
    _id: string;
    name: string;
    intro?: string;
    tmbId: string;
    type: AppTypeEnum;
    parentId?: ParentIdType;
    inheritPermission?: boolean;
  }[] = await MongoApp.find(
    { teamId, type: { $in: [AppTypeEnum.httpToolSet, AppTypeEnum.mcpToolSet] }, deleteTime: null },
    '_id name intro tmbId type parentId inheritPermission'
  ).lean();

  // Add app permission and filter apps by read permission
  const formatApps = myApps
    .map((app) => {
      const { Per, privateApp } = (() => {
        const getPer = (appId: string) => {
          const tmbRole = myPerList.find(
            (item) => String(item.resourceId) === appId && !!item.tmbId
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...myPerList
              .filter(
                (item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );

          return new AppPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(app.tmbId) === String(tmbId)
          });
        };

        const getClbCount = (appId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(appId)).length;
        };

        // Inherit app, check parent folder clb and it's own clb
        if (!AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission) {
          return {
            Per: getPer(String(app.parentId)).addRole(getPer(String(app._id)).role),
            privateApp: getClbCount(String(app.parentId)) <= 1
          };
        }

        return {
          Per: getPer(String(app._id)),
          privateApp: getClbCount(String(app._id)) <= 1
        };
      })();

      return {
        ...app,
        parentId: app.parentId,
        permission: Per,
        private: privateApp
      };
    })
    .filter((app) => app.permission.hasReadPer);

  return formatApps;
};
