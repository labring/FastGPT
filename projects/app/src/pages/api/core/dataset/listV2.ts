import { NextAPI } from '@/service/middleware/entry';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { normalizePagination } from '@fastgpt/service/common/api/pagination';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  GetDatasetListV2BodySchema,
  GetDatasetListV2ResponseSchema,
  type GetDatasetListV2Body,
  type GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { desensitizeModel } from '@fastgpt/service/core/ai/model/transform';
import { countTeamAppsByPublishedResourceGroups } from '@fastgpt/service/core/app/resourceLookup';
import { countDatasetCollectionsByDatasetIds } from '@fastgpt/service/core/dataset/collection/entity';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByResourceIds
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { getVisibleChildren } from '@fastgpt/global/common/parentFolder/visibleChildren';
import {
  getDatasetFolderListScope,
  hasReadableDatasetFolderChild
} from '@/service/core/dataset/visibleList';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

/**
 * 分页或按 ID 列出可读知识库，仍受团队、权限及公共筛选条件约束。
 * 仅为返回的资源按需计算文件数和应用引用数；文件数不按集合权限过滤，引用数仅返回给 Owner。
 */
async function handler(
  req: ApiRequestProps<GetDatasetListV2Body>
): Promise<GetDatasetListV2Response> {
  const body = parseApiInput({ req, bodySchema: GetDatasetListV2BodySchema }).body;
  const { datasetIds, type, searchKey, sort, tmbIds, withAppCount, withFileCount } = body;
  const pagination = body.datasetIds === undefined ? body : undefined;
  const parentId = pagination?.parentId;
  const { pageSize, offset } = normalizePagination(pagination ?? {});
  const isDatasetIdsQuery = datasetIds !== undefined;

  const currentFolderId = normalizeParentId(parentId);

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

  if (Array.isArray(tmbIds) && tmbIds.length === 0) {
    return GetDatasetListV2ResponseSchema.parse({ list: [], total: 0 });
  }

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

  const folderScope =
    !isDatasetIdsQuery && (parentId || !teamPer.isOwner || searchKey)
      ? await getDatasetFolderListScope({ teamId, currentFolderId })
      : { folders: [], folderIds: [] };
  if (parentId) {
    const currentFolder = folderScope.folders.find(({ _id }) => _id === parentId);
    if (!currentFolder) {
      await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal,
        datasetId: parentId
      });
      throw CommonErrEnum.invalidParams;
    }
    if (
      !teamPer.isOwner &&
      !readableResourceIds.some((id) => String(id) === parentId) &&
      !(await hasReadableDatasetFolderChild({
        teamId,
        folderIds: folderScope.folderIds,
        readableResourceIds
      }))
    ) {
      await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal,
        datasetId: parentId
      });
    }
  }

  const searchMatch = searchKey
    ? {
        $or: [
          { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
          { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
        ]
      }
    : undefined;
  const baseQuery = {
    teamId,
    deleteTime: null,
    ...(teamPer.isOwner ? {} : { _id: { $in: readableResourceIds } }),
    ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
    ...(tmbIds ? { tmbId: { $in: tmbIds } } : {})
  };
  const isMergedList = !isDatasetIdsQuery && !teamPer.isOwner && !searchKey;
  const parentScopeQuery = (() => {
    // ID 查询不参与目录导航，保留 ACL 与请求 ID 的交集。
    if (isDatasetIdsQuery) return { _id: { $in: datasetIds } };
    if (!searchKey && teamPer.isOwner) return parseParentIdInMongo(parentId);
    if (parentId) return { parentId: { $in: folderScope.folderIds } };
    return {
      $or: [
        { parentId: null },
        ...(folderScope.folderIds.length ? [{ parentId: { $in: folderScope.folderIds } }] : [])
      ]
    };
  })();
  const findDatasetQuery = {
    $and: [baseQuery, parentScopeQuery, ...(searchMatch ? [searchMatch] : [])]
  };

  const datasetSort = ((): Record<string, 1 | -1> => {
    if (sort === AppListSortEnum.createTimeAsc) return { _id: 1 };
    if (sort === AppListSortEnum.createTimeDesc) return { _id: -1 };
    return { updateTime: -1, _id: -1 };
  })();
  let myDatasets: DatasetSchemaType[];
  let total: number;
  const folderAccessModeMap = new Map<string, 'read' | 'navigate'>();
  if (isMergedList) {
    const readableResources = await MongoDataset.find(findDatasetQuery, '_id parentId type').lean();
    const includedFolderTypes = type
      ? (Array.isArray(type) ? type : [type]).filter((item) => item === DatasetTypeEnum.folder)
      : [DatasetTypeEnum.folder];
    const visibleChildren = getVisibleChildren({
      currentFolderId,
      readableResources: readableResources.map((dataset) => ({
        _id: String(dataset._id),
        parentId: dataset.parentId ? String(dataset.parentId) : null,
        type: dataset.type
      })),
      folders: folderScope.folders,
      folderTypes: [DatasetTypeEnum.folder],
      includedFolderTypes
    });
    visibleChildren.forEach(({ id, folderAccessMode }) => {
      if (folderAccessMode) folderAccessModeMap.set(id, folderAccessMode);
    });
    const visibleIds = visibleChildren.map(({ id }) => id);
    const visibleDatasets = visibleIds.length
      ? await MongoDataset.find(
          { _id: { $in: visibleIds }, teamId, deleteTime: null },
          '_id parentId teamId avatar name intro type vectorModelId agentModelId vlmModelId vectorModel agentModel vlmModel inheritPermission tmbId createTime updateTime'
        ).lean()
      : [];
    const [sortField, direction] = Object.entries(datasetSort)[0];
    visibleDatasets.sort((a, b) => {
      const leftValue = a[sortField as keyof typeof a];
      const rightValue = b[sortField as keyof typeof b];
      const left = leftValue instanceof Date ? leftValue.getTime() : String(leftValue ?? '');
      const right = rightValue instanceof Date ? rightValue.getTime() : String(rightValue ?? '');
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true });
      return comparison ? comparison * direction : String(a._id).localeCompare(String(b._id));
    });
    total = visibleDatasets.length;
    myDatasets = visibleDatasets.slice(offset, offset + pageSize);
  } else {
    const [datasets, count] = await Promise.all([
      MongoDataset.find(findDatasetQuery)
        .sort(datasetSort)
        .skip(offset)
        .limit(isDatasetIdsQuery ? datasetIds.length : pageSize)
        .lean(),
      MongoDataset.countDocuments(findDatasetQuery)
    ]);
    myDatasets = datasets;
    total = count;
  }
  for (const dataset of myDatasets) {
    if (dataset.type === DatasetTypeEnum.folder && !folderAccessModeMap.has(String(dataset._id))) {
      folderAccessModeMap.set(String(dataset._id), 'read');
    }
  }
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

  const modelHandle = await getTeamModelHandle({ teamId });
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
      intro: dataset.intro ?? '',
      type: dataset.type,
      vectorModel: (() => {
        const vectorModel = modelHandle.findModelData(
          getDatasetModelReference(dataset, 'embedding'),
          { type: 'embedding' }
        );
        return vectorModel ? desensitizeModel(vectorModel) : undefined;
      })(),
      inheritPermission: dataset.inheritPermission,
      tmbId: dataset.tmbId,
      createTime: dataset.createTime ?? new Types.ObjectId(String(dataset._id)).getTimestamp(),
      updateTime: dataset.updateTime,
      permission: Per,
      private: privateDataset,
      ...(folderAccessModeMap.has(String(dataset._id))
        ? { folderAccessMode: folderAccessModeMap.get(String(dataset._id)) }
        : {})
    };
  });

  const nonFolderDatasets = formatDatasets.filter(
    (dataset) => dataset.type !== DatasetTypeEnum.folder
  );
  // 文件数需要扫描库内 collection，仅在调用方显式请求时计算。
  const [fileCountMap, appCountMap] = await Promise.all([
    withFileCount
      ? countDatasetCollectionsByDatasetIds({
          teamId,
          datasetIds: nonFolderDatasets.map((dataset) => String(dataset._id))
        })
      : undefined,
    withAppCount
      ? countTeamAppsByPublishedResourceGroups({
          teamId,
          resourceGroups: nonFolderDatasets.map((dataset) => {
            const id = String(dataset._id);
            return {
              id,
              isOwner: dataset.permission.isOwner,
              resources: [{ type: 'dataset', id }]
            };
          })
        })
      : undefined
  ]);
  const list = await addSourceMember({
    list: formatDatasets.map((dataset) => ({
      ...dataset,
      ...(dataset.type !== DatasetTypeEnum.folder && fileCountMap
        ? { fileCount: fileCountMap.get(String(dataset._id)) ?? 0 }
        : {}),
      ...(dataset.permission.isOwner && appCountMap?.has(String(dataset._id))
        ? { appCount: appCountMap.get(String(dataset._id)) ?? 0 }
        : {})
    }))
  });
  return GetDatasetListV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
