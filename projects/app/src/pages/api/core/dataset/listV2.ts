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
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetDatasetListV2BodySchema,
  GetDatasetListV2ResponseSchema,
  type GetDatasetListV2Body,
  type GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetListV2Response> {
  const {
    parentId,
    type,
    searchKey,
    pageNum = 1,
    pageSize = 50,
    offset
  } = parseApiInput({
    req,
    bodySchema: GetDatasetListV2BodySchema
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

  const { readableResourceIds, groupIds, orgIds } = await (async () => {
    if (teamPer.isOwner) return { readableResourceIds: [], groupIds: [], orgIds: [] };
    const [groups, orgSet] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId })
    ]);
    const groupIds = groups.map((item) => String(item._id));
    const orgIds = Array.from(orgSet).map(String);
    const readableResourceIds = await findResourceKeysByCollaboratorsPermission({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      tmbId,
      groupIds,
      orgIds,
      permission: ReadPermissionVal,
      matchLogic: 'or',
      personalPermissionPriority: true
    });
    return { readableResourceIds, groupIds, orgIds };
  })();

  const findDatasetQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};
    const permissionQuery = teamPer.isOwner ? {} : { _id: { $in: readableResourceIds } };
    const baseQuery = {
      teamId,
      deleteTime: null,
      ...permissionQuery,
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {})
    };
    if (searchKey) return { $and: [baseQuery, searchMatch] };
    return { ...baseQuery, ...parseParentIdInMongo(parentId) };
  })();

  const skip = offset ?? (pageNum - 1) * pageSize;
  const [myDatasets, total] = await Promise.all([
    MongoDataset.find(findDatasetQuery)
      .sort({ updateTime: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    MongoDataset.countDocuments(findDatasetQuery)
  ]);
  const pageRoleList = await getResourcePermissionsByResourceIds({
    resourceType: PerResourceTypeEnum.dataset,
    teamId,
    resourceIds: myDatasets.map((dataset) => String(dataset._id))
  });
  const roleListMap = new Map<string, (typeof pageRoleList)[number][]>();
  pageRoleList.forEach((item) => {
    const resourceId = String(item.resourceId);
    const list = roleListMap.get(resourceId) ?? [];
    list.push(item);
    roleListMap.set(resourceId, list);
  });

  const formatDatasets = myDatasets.map((dataset) => {
    const { Per, privateDataset } = (() => {
      const resourceClbs = roleListMap.get(String(dataset._id)) ?? [];
      const getPer = () => {
        const tmbRole = resourceClbs.find(
          (item) => String(item.tmbId) === String(tmbId)
        )?.permission;
        const groupAndOrgRole = sumPer(
          ...resourceClbs
            .filter(
              (item) =>
                (item.groupId && groupIds.includes(String(item.groupId))) ||
                (item.orgId && orgIds.includes(String(item.orgId)))
            )
            .map((item) => item.permission)
        );
        return new DatasetPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };
      return {
        Per: getPer(),
        privateDataset: isPrivateResourceByCollaborators({ resourceClbs })
      };
    })();
    return {
      _id: dataset._id,
      avatar: dataset.avatar,
      name: dataset.name,
      intro: dataset.intro,
      type: dataset.type,
      vectorModel: getEmbeddingModel(dataset.vectorModel),
      inheritPermission: dataset.inheritPermission,
      tmbId: dataset.tmbId,
      updateTime: dataset.updateTime,
      permission: Per,
      private: privateDataset
    };
  });

  const list = await addSourceMember({ list: formatDatasets });
  return GetDatasetListV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
