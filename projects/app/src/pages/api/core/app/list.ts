import { Types } from 'mongoose';
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
import {
  parseParentIdInMongo,
  getAllDescendantIds
} from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type ListAppBody = {
  parentId?: ParentIdType;
  type?: AppTypeEnum | AppTypeEnum[];
  searchKey?: string;
  /** 分页页码（从 1 开始）。与 pageSize 同时传入时启用分页模式，返回 { list, total }；否则返回原数组结构 */
  pageNum?: number;
  /** 分页每页数量。与 pageNum 同时传入时启用分页模式 */
  pageSize?: number;
};

/*
  获取 APP 列表权限
  1. 校验 folder 权限和获取 team 权限（owner 单独处理）
  2. 获取 team 下所有 app 权限。获取我的所有组。并计算出我所有的app权限。
  3. 过滤我有的权限的 app，以及当前 parentId 的 app（由于权限继承问题，这里没法一次性根据 id 去获取）
  4. 根据过滤条件获取 app 列表
  5. 遍历搜索出来的 app，并赋予权限（继承的 app，使用 parent 的权限）
  6. 再根据 read 权限进行一次过滤。
*/

type ListAppResponse = AppListItemType[] | { list: AppListItemType[]; total: number };

async function handler(req: ApiRequestProps<ListAppBody>): Promise<ListAppResponse> {
  const { parentId, type, searchKey, pageNum, pageSize } = req.body;
  const isPaginated = pageNum !== undefined && pageSize !== undefined;

  // 分页参数边界验证
  if (isPaginated) {
    if (pageNum < 1 || !Number.isInteger(pageNum)) {
      throw new Error('pageNum must be a positive integer');
    }
    if (pageSize < 1 || !Number.isInteger(pageSize)) {
      throw new Error('pageSize must be a positive integer');
    }
  }

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

  // Search by creator name: find matching team members first
  const creatorMatchedTmbIds: string[] = searchKey
    ? (
        await MongoTeamMember.find(
          {
            teamId,
            name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') }
          },
          '_id'
        ).lean()
      ).map((m) => String(m._id))
    : [];

  const findAppsQuery = await (async () => {
    // Filter apps by permission, if not owner, only get apps that I have permission to access
    const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
    const appPerQuery = teamPer.isOwner
      ? {
          parentId: parentId ? parseParentIdInMongo(parentId) : null
        }
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };

    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            ...(creatorMatchedTmbIds.length > 0 ? [{ tmbId: { $in: creatorMatchedTmbIds } }] : [])
          ]
        }
      : {};

    const _type = (() => {
      if (type) {
        // 如果明确指定了类型，则按指定类型查询（包括 hidden）
        return Array.isArray(type) ? { $in: type } : type;
      }
      // 如果没有指定类型，则排除 hidden 类型
      return { $ne: AppTypeEnum.hidden } as const;
    })();

    if (searchKey) {
      const query: any = {
        teamId,
        type: _type
      };

      // 搜索时限定范围到当前文件夹及其所有子孙文件夹
      if (parentId) {
        const allIds = await getAllDescendantIds(
          (parentIds) =>
            MongoApp.find({ parentId: { $in: parentIds }, teamId, deleteTime: null }, '_id').lean(),
          parentId
        );
        query.parentId = { $in: allIds };
      }

      // 使用 $and 合并权限 $or 和搜索 $or，避免后者覆盖前者
      if (appPerQuery.$or) {
        query.$and = [{ $or: searchMatch.$or! }, { $or: appPerQuery.$or }];
      } else {
        query.$or = searchMatch.$or;
      }

      return query;
    }

    return {
      ...appPerQuery,
      teamId,
      type: _type,
      ...parseParentIdInMongo(parentId)
    };
  })();
  const baseQuery = { ...findAppsQuery, deleteTime: null };
  const limit = (() => {
    if (searchKey) return 50;
    return;
  })();

  const myApps = await MongoApp.find(
    { ...findAppsQuery, deleteTime: null },
    '_id parentId avatar type name intro tmbId updateTime pluginData inheritPermission modules isPinned',
    {
      limit: limit
    }
  )
    .sort({
      isPinned: -1,
      updateTime: -1
    })
    .lean();

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
            isOwner: String(app.tmbId) === String(tmbId) || teamPer.isOwner
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

      const { modules, ...rest } = app;
      const hasInteractiveNode = modules?.some((item) =>
        [FlowNodeTypeEnum.formInput, FlowNodeTypeEnum.userSelect].includes(item.flowNodeType)
      );

      return {
        ...rest,
        parentId: app.parentId,
        permission: Per,
        private: privateApp,
        hasInteractiveNode
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const formatList = await addSourceMember({
    list: formatApps
  });

  // Compute relatedAppCount for tool-type apps (non-folder)
  const toolApps = formatList.filter(
    (app) => ToolTypeList.includes(app.type) && !AppFolderTypeList.includes(app.type)
  );
  const relatedAppCountMap = new Map<string, number>();
  if (toolApps.length > 0) {
    const counts = await Promise.all(
      toolApps.map((app) => {
        const toolId = String(app._id);
        return MongoApp.countDocuments({
          teamId,
          deleteTime: null,
          $or: [
            // advanced/workflow: pluginModule node with top-level pluginId
            { 'modules.pluginId': toolId },
            // chatAgent: agent node stores tools in agent_selectedTools input
            {
              modules: {
                $elemMatch: {
                  flowNodeType: FlowNodeTypeEnum.agent,
                  inputs: {
                    $elemMatch: {
                      key: NodeInputKeyEnum.selectedTools,
                      'value.id': toolId
                    }
                  }
                }
              }
            }
          ]
        });
      })
    );
    toolApps.forEach((app, i) => {
      relatedAppCountMap.set(String(app._id), counts[i]);
    });
  }

  // Compute relatedAppCount for tool folders (sum of all non-folder tool descendants)
  const toolFolderApps = formatList.filter((app) => app.type === AppTypeEnum.toolFolder);
  if (toolFolderApps.length > 0) {
    const folderCounts = await Promise.all(
      toolFolderApps.map(async (folder) => {
        const agg = await MongoApp.aggregate<{
          descendants: Array<{ _id: any; type: string }>;
        }>([
          { $match: { _id: new Types.ObjectId(String(folder._id)) } },
          {
            $graphLookup: {
              from: 'apps',
              startWith: '$_id',
              connectFromField: '_id',
              connectToField: 'parentId',
              as: 'descendants',
              restrictSearchWithMatch: { deleteTime: null }
            }
          },
          { $project: { _id: 0, descendants: { _id: 1, type: 1 } } }
        ]);

        const toolDescendantIds = (agg[0]?.descendants ?? [])
          .filter((d) => ToolTypeList.includes(d.type as AppTypeEnum))
          .map((d) => String(d._id));

        if (toolDescendantIds.length === 0) return 0;

        return MongoApp.countDocuments({
          teamId,
          deleteTime: null,
          $or: [
            { 'modules.pluginId': { $in: toolDescendantIds } },
            {
              modules: {
                $elemMatch: {
                  flowNodeType: FlowNodeTypeEnum.agent,
                  inputs: {
                    $elemMatch: {
                      key: NodeInputKeyEnum.selectedTools,
                      'value.id': { $in: toolDescendantIds }
                    }
                  }
                }
              }
            }
          ]
        });
      })
    );
    toolFolderApps.forEach((folder, i) => {
      relatedAppCountMap.set(String(folder._id), folderCounts[i]);
    });
  }

  const listWithRelatedCount = formatList.map((app) => ({
    ...app,
    ...(relatedAppCountMap.has(String(app._id))
      ? { relatedAppCount: relatedAppCountMap.get(String(app._id)) }
      : {})
  }));

  if (isPaginated) {
    const total = listWithRelatedCount.length;
    const start = (pageNum! - 1) * pageSize!;
    const list = listWithRelatedCount.slice(start, start + pageSize!);
    return { list, total };
  }
  return listWithRelatedCount;
}

export default NextAPI(handler);
