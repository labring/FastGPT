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
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/model/transform';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
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
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getDescendantFolderIds } from '@fastgpt/global/common/parentFolder/subtree';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { countTeamAppsByPublishedResourceGroups } from '@fastgpt/service/core/app/resourceLookup';

/** 层序遍历的安全上限：脏树（环 / 超深）不得拖垮请求。 */
const maxSubtreeDepth = 20;
/** 层序遍历累计访问的文件夹数上限，用于约束搜索谓词里 `$in` 数组的长度。 */
const maxSubtreeNodes = 20000;
const subtreeLogger = getLogger(LogCategories.MODULE.DATASET);

/**
 * 收集 datasetId 子树内全部**文件夹** ID（不含自身）。
 *
 * 一次性把团队下全部知识库文件夹读进内存（只投影 `_id parentId`），按 parentId 分桶后层序下行，
 * 因此恒定 1 次查询、延迟不随子树规模变化；代价是无论搜在哪都要扫全量文件夹。
 * 与 findDatasetAndAllChildren 的区别：后者是逐节点串行递归（每节点一次查询、不区分文件夹与知识库），
 * 服务删除这类低 QPS 场景没问题；本函数服务搜索范围这类交互热路径。
 * 通用遍历见 global/common/parentFolder/subtree.ts。
 *
 * 触达上限时返回已收集的部分（调用方须接受搜索范围可能不完整）。
 */
const findSubtreeDatasetFolderIds = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<string[]> => {
  const folders = await MongoDataset.find(
    {
      teamId: new Types.ObjectId(teamId),
      type: DatasetTypeEnum.folder,
      deleteTime: null
    },
    '_id parentId',
    { ...readFromSecondary }
  ).lean();

  // 按 parentId 分桶。根级文件夹（parentId 为空）不会成为「谁的子级」的查询键，跳过。
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ? String(folder.parentId) : '';
    if (!parentKey) continue;
    const children = childrenByParent.get(parentKey);
    if (children) children.push(String(folder._id));
    else childrenByParent.set(parentKey, [String(folder._id)]);
  }

  const { ids, truncated } = await getDescendantFolderIds({
    rootIds: [datasetId],
    maxDepth: maxSubtreeDepth,
    maxNodes: maxSubtreeNodes,
    findChildFolders: async (folderIds) => folderIds.flatMap((id) => childrenByParent.get(id) ?? [])
  });

  if (truncated) {
    subtreeLogger.warn(
      `[findSubtreeDatasetFolderIds] traversal truncated, search scope may miss deeper folders: datasetId=${datasetId} collected=${ids.length}`
    );
  }

  return ids;
};

async function handler(
  req: ApiRequestProps<GetDatasetListV2Body>
): Promise<GetDatasetListV2Response> {
  const {
    parentId,
    type,
    searchKey,
    sort,
    tmbIds,
    pageNum = 1,
    pageSize = 50,
    offset,
    withAppCount
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

  // 搜索范围限定在当前路径及其子树，先枚举子树内的文件夹 ID（根目录搜索无需枚举）。
  const subtreeFolderIds =
    searchKey && parentId ? await findSubtreeDatasetFolderIds({ teamId, datasetId: parentId }) : [];

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
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...(tmbIds ? { tmbId: { $in: tmbIds } } : {})
    };
    if (searchKey) {
      // 搜索：当前路径自身 + 其下整个子树；不含祖先、不含路径外内容（根目录即全库）
      return {
        $and: [
          baseQuery,
          searchMatch,
          ...(parentId ? [{ parentId: { $in: [parentId, ...subtreeFolderIds] } }] : [])
        ]
      };
    }
    return { ...baseQuery, ...parseParentIdInMongo(parentId) };
  })();

  const skip = offset ?? (pageNum - 1) * pageSize;
  const datasetSort = ((): Record<string, 1 | -1> => {
    if (sort === AppListSortEnum.createTimeAsc) return { _id: 1 };
    if (sort === AppListSortEnum.createTimeDesc) return { _id: -1 };
    return { updateTime: -1, _id: -1 };
  })();
  const [myDatasets, total] = await Promise.all([
    MongoDataset.find(findDatasetQuery).sort(datasetSort).skip(skip).limit(pageSize).lean(),
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

  const modelHandle = await getModelHandle();
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
        return vectorModel ? desensitizeSystemModel(vectorModel) : undefined;
      })(),
      inheritPermission: dataset.inheritPermission,
      tmbId: dataset.tmbId,
      createTime: dataset.createTime ?? new Types.ObjectId(String(dataset._id)).getTimestamp(),
      updateTime: dataset.updateTime,
      permission: Per,
      private: privateDataset
    };
  });

  const appCountMap = withAppCount
    ? await countTeamAppsByPublishedResourceGroups({
        teamId,
        resourceGroups: formatDatasets
          .filter((dataset) => dataset.type !== DatasetTypeEnum.folder)
          .map((dataset) => {
            const id = String(dataset._id);
            return {
              id,
              isOwner: dataset.permission.isOwner,
              resources: [{ type: 'dataset', id }]
            };
          })
      })
    : undefined;
  const list = await addSourceMember({
    list: formatDatasets.map((dataset) => ({
      ...dataset,
      ...(dataset.permission.isOwner && appCountMap?.has(String(dataset._id))
        ? { appCount: appCountMap.get(String(dataset._id)) ?? 0 }
        : {})
    }))
  });
  return GetDatasetListV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
