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
import { sumPer } from '@fastgpt/global/support/permission/utils';

type Query = { datasetId: string };

export type AppsByDatasetIdItem = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
  tmbId: string;
  type: string;
  updateTime: Date;
  sourceMember: { name: string; avatar?: string | null; status: string };
};

async function handler(req: ApiRequestProps<unknown, Query>): Promise<AppsByDatasetIdItem[]> {
  const { datasetId } = req.query;

  if (!datasetId) {
    return Promise.reject(new Error('datasetId is required'));
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

  const myPerList = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const apps = await MongoApp.find(
    {
      teamId,
      deleteTime: null,
      modules: {
        $elemMatch: {
          inputs: {
            $elemMatch: {
              key: 'datasets',
              'value.datasetId': datasetId
            }
          }
        }
      }
    },
    '_id parentId avatar type name intro tmbId updateTime inheritPermission'
  )
    .sort({ updateTime: -1 })
    .lean();

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
    .map(({ permission: _permission, ...rest }) => rest);

  return addSourceMember({ list: formatApps });
}

export default NextAPI(handler);
