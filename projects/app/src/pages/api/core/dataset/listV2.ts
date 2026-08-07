import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
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
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { isPrivateResourceByCollaborators, sumPer } from '@fastgpt/global/support/permission/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseV2Pagination } from '@fastgpt/service/common/api/paginationV2';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  getMyResourcePermission,
  buildReadableMatch,
  mergeMongoAndQuery,
  addSourceMemberV2,
  READABLE_IDS_LIMIT
} from '@fastgpt/service/support/permission/resource/readable';
import {
  ListDatasetV2BodySchema,
  type ListDatasetV2Body,
  type ListDatasetV2Response
} from '@fastgpt/global/openapi/core/dataset/api';

/*
  获取知识库列表（分页版）
  - 搜索分支不带 type 过滤（与旧接口行为一致，旧实现搜索时不按 type 过滤）
  - projection 收窄为页所需字段（parentId 供页内权限计算，不作为响应字段）
  - find 与 countDocuments 同一 match 常量 + 同一 readFromSecondary
*/

async function handler(req: ApiRequestProps<ListDatasetV2Body>): Promise<ListDatasetV2Response> {
  const {
    parentId,
    type,
    searchKey,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = parseApiInput({
    req,
    bodySchema: ListDatasetV2BodySchema
  }).body;
  const { pageSize, offset } = parseV2Pagination({
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  });

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

  const { myPerList, roleListMap, readableDirectIds } = await getMyResourcePermission({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.dataset,
    createPermission: (role) => new DatasetPermission({ role })
  });

  // 可读集合过大时拒绝请求（$in 数组过大会让查询与计数失控）
  if (!teamPer.isOwner && readableDirectIds.length > READABLE_IDS_LIMIT) {
    return Promise.reject(CommonErrEnum.tooManyReadableResources);
  }

  const perMatch = teamPer.isOwner
    ? {}
    : buildReadableMatch({
        readableDirectIds,
        tmbId,
        folderTypeList: [DatasetTypeEnum.folder]
      });

  const typeCond = type ? { type } : {};

  const searchMatch = searchKey
    ? {
        $or: [
          { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
          { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
        ]
      }
    : {};

  // 逐模式 match：搜索分支不带 type（复刻旧语义）；searchKey 无顶层 parentId
  const match = mergeMongoAndQuery(
    { teamId, deleteTime: null }, // 关键：只返回未删除的数据
    perMatch,
    searchKey ? searchMatch : typeCond,
    searchKey ? {} : parseParentIdInMongo(parentId)
  );

  const [myDatasets, total] = await Promise.all([
    MongoDataset.find(
      match,
      '_id avatar name intro type vectorModel inheritPermission tmbId updateTime parentId',
      {
        ...readFromSecondary
      }
    )
      .sort({ updateTime: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDataset.countDocuments(match, { ...readFromSecondary })
  ]);

  // 页内后处理：Per/private + getEmbeddingModel
  const formatDatasets = myDatasets.map((dataset) => {
    const { Per, privateDataset } = (() => {
      const getPer = (datasetId: string) => {
        const myRecords = myPerList.filter((item) => String(item.resourceId) === datasetId);
        const tmbRole = myRecords.find((item) => !!item.tmbId)?.permission;
        const groupAndOrgRole = sumPer(
          ...myRecords
            .filter((item) => !!item.groupId || !!item.orgId)
            .map((item) => item.permission)
        );

        return new DatasetPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };

      // inherit
      if (
        dataset.inheritPermission &&
        dataset.parentId &&
        dataset.type !== DatasetTypeEnum.folder
      ) {
        const resourceClbs = roleListMap.get(String(dataset._id)) ?? [];
        const parentClbs = roleListMap.get(String(dataset.parentId)) ?? [];

        return {
          Per: getPer(String(dataset.parentId)).addRole(getPer(String(dataset._id)).role),
          privateDataset: isPrivateResourceByCollaborators({
            resourceClbs,
            parentClbs,
            inheritPermission: true
          })
        };
      }

      const resourceClbs = roleListMap.get(String(dataset._id)) ?? [];

      return {
        Per: getPer(String(dataset._id)),
        privateDataset: isPrivateResourceByCollaborators({
          resourceClbs
        })
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

  // 谓词等价性防御：命中谓词外资源说明权限谓词回归，仅告警不改结果
  const invalidDataset = formatDatasets.find((dataset) => !dataset.permission.hasReadPer);
  if (invalidDataset) {
    console.warn('[listV2] dataset 命中权限谓词外资源（谓词回归？）', invalidDataset._id);
  }

  const list = await addSourceMemberV2({
    list: formatDatasets
  });

  // 与旧接口一致：不 parse 响应（旧 dataset/list 直接返回；vectorModel 依赖运行时模型配置）
  return { list, total };
}

export default NextAPI(handler);
