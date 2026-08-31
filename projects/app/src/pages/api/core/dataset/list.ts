import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { findDatasetEmbeddingModel } from '@fastgpt/service/core/dataset/model';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import { getResourcePermissionsByTeam } from '@fastgpt/service/support/permission/resourcePermissionService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetDatasetListBodySchema,
  type GetDatasetListResponse
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetListResponse> {
  const { parentId, type, searchKey } = parseApiInput({
    req,
    bodySchema: GetDatasetListBodySchema
  }).body;

  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({ req, authToken: true, authApiKey: true, per: ReadPermissionVal }),
    ...(parentId
      ? [
          authDataset({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            datasetId: parentId
          })
        ]
      : [])
  ]);

  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    getResourcePermissionsByTeam({ resourceType: PerResourceTypeEnum.dataset, teamId }),
    getGroupsByTmbId({ tmbId, teamId }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);
  const roleListMap = new Map<string, (typeof roleList)[number][]>();
  roleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });
  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const findDatasetQuery = (() => {
    const idList = { _id: { $in: myRoles.map((item) => item.resourceId) } };
    const datasetPerQuery = teamPer.isOwner ? {} : idList;
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};
    if (searchKey) {
      const data = {
        ...datasetPerQuery,
        teamId,
        deleteTime: null,
        ...searchMatch
      };
      // @ts-ignore
      delete data.parentId;
      return data;
    }
    return {
      ...datasetPerQuery,
      teamId,
      deleteTime: null,
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const myDatasets = await MongoDataset.find(findDatasetQuery).sort({ updateTime: -1 }).lean();
  const formatDatasets = myDatasets
    .map((dataset) => {
      const { Per, privateDataset } = (() => {
        const getPer = (datasetId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === datasetId && !!item.tmbId
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === datasetId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );
          return new DatasetPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };
        const resourceClbs = roleListMap.get(String(dataset._id)) ?? [];
        return {
          Per: getPer(String(dataset._id)),
          privateDataset: isPrivateResourceByCollaborators({ resourceClbs })
        };
      })();
      return {
        _id: dataset._id,
        avatar: dataset.avatar,
        name: dataset.name,
        intro: dataset.intro,
        type: dataset.type,
        vectorModel: (() => {
          const vectorModel = findDatasetEmbeddingModel(dataset);
          return vectorModel ? desensitizeSystemModel(vectorModel) : undefined;
        })(),
        inheritPermission: dataset.inheritPermission,
        tmbId: dataset.tmbId,
        updateTime: dataset.updateTime,
        permission: Per,
        private: privateDataset
      };
    })
    .filter((app) => app.permission.hasReadPer);

  return addSourceMember({ list: formatDatasets });
}

export default NextAPI(handler);
