import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getTmbPermission } from '../controller';
import {
  type CollectionWithDatasetType,
  type DatasetDataItemType,
  type DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoDataset } from '../../../core/dataset/schema';
import {
  ManageRoleVal,
  NullPermissionVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { CollectionPermission } from '@fastgpt/global/support/permission/collection/controller';
import { getCollectionWithDataset } from '../../../core/dataset/controller';
import { MongoDatasetData } from '../../../core/dataset/data/schema';
import { type AuthModeType, type AuthResponseType } from '../type';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { parseHeaderCert } from '../auth/common';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { shouldInheritResourcePermission } from '../resourcePermissionPolicy';
import { resolveCollectionPermission } from '../collection/auth';

export const authDatasetByTmbId = async ({
  tmbId,
  datasetId,
  per,
  isRoot = false
}: {
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  dataset: DatasetSchemaType & {
    permission: DatasetPermission;
  };
}> => {
  const dataset = await (async () => {
    const [{ teamId, permission: tmbPer }, dataset] = await Promise.all([
      getTmbInfoByTmbId({ tmbId }),
      MongoDataset.findOne({ _id: datasetId }).lean()
    ]);

    if (!dataset) {
      return Promise.reject(DatasetErrEnum.unExist);
    }

    if (isRoot) {
      return {
        ...dataset,
        permission: new DatasetPermission({
          isOwner: true
        })
      };
    }

    if (String(dataset.teamId) !== teamId) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    const isOwner = tmbPer.isOwner || String(dataset.tmbId) === String(tmbId);
    const isGetParentClb =
      shouldInheritResourcePermission(dataset.inheritPermission) &&
      dataset.type !== DatasetTypeEnum.folder &&
      !!dataset.parentId;
    const [folderPer = 0, myPer = 0] = await Promise.all([
      isGetParentClb
        ? getTmbPermission({
            teamId,
            tmbId,
            resourceId: dataset.parentId!,
            resourceType: PerResourceTypeEnum.dataset
          })
        : 0,
      getTmbPermission({
        teamId,
        tmbId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset
      })
    ]);

    const Per = new DatasetPermission({ role: sumPer(folderPer, myPer), isOwner });

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      permission: Per
    };
  })();

  return { dataset };
};

export const authDataset = async ({
  datasetId,
  per,
  ...props
}: AuthModeType & {
  datasetId: ParentIdType;
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    dataset: DatasetSchemaType & {
      permission: DatasetPermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;

  if (!datasetId) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: dataset.permission,
    dataset
  };
};

/**
 * Collection 创建入口的统一鉴权：根目录要求 Dataset write，非根目录要求目标 Folder write。
 * 非根目录同时校验父 Collection 确实属于请求中的 Dataset，避免跨 Dataset 注入 parentId。
 */
export const authDatasetCollectionCreate = async ({
  datasetId,
  parentId,
  ...props
}: AuthModeType & {
  datasetId: string;
  parentId?: ParentIdType;
}) => {
  if (!parentId) {
    return authDataset({
      ...props,
      datasetId,
      per: WritePermissionVal
    });
  }

  const result = await authDatasetCollection({
    ...props,
    collectionId: parentId,
    per: WritePermissionVal
  });
  if (String(result.collection.datasetId) !== String(datasetId)) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
  }
  const { dataset } = await authDatasetByTmbId({
    tmbId: result.tmbId,
    datasetId,
    per: ReadPermissionVal,
    isRoot: result.isRoot
  });

  return {
    ...result,
    dataset
  };
};

// 先校验 Dataset read 门槛，再按 Collection 维度解析有效权限并校验 per。
export async function authDatasetCollection({
  collectionId,
  per = NullPermissionVal,
  ...props
}: AuthModeType & {
  collectionId: string;
  isRoot?: boolean;
}): Promise<
  AuthResponseType<CollectionPermission> & {
    collection: CollectionWithDatasetType;
  }
> {
  const { teamId, tmbId, userId, isRoot: isRootFromHeader } = await parseHeaderCert(props);
  const collection = await getCollectionWithDataset(collectionId);

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  // 1. Dataset read 门槛：Collection 权限不能绕过 Dataset 权限
  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId: collection.datasetId,
    per: ReadPermissionVal,
    isRoot: isRootFromHeader
  });

  // collection 与 dataset 必须属于同一团队；否则说明对象归属已经损坏，不能继续按 datasetId 授权。
  if (String(collection.teamId) !== String(dataset.teamId)) {
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  // 系统 root 用户：与 Dataset 级 isRoot 语义一致，跳过 Collection 级权限解析。
  if (isRootFromHeader) {
    return {
      userId,
      teamId,
      tmbId,
      collection,
      permission: new CollectionPermission({ isOwner: true }),
      isRoot: isRootFromHeader
    };
  }

  // 2. 团队 owner/admin 旁路（短路语义）：
  //    Dataset read 门槛已通过。团队 owner/admin 对该 Dataset 下所有 Collection 视为可读/管理，
  //    与 listV2 短路保持一致，避免「列表可见但点进去无权限」。
  const tmbInfo = await getTmbInfoByTmbId({ tmbId });
  const isTeamOwnerOrAdmin =
    String(tmbInfo.teamId) === String(teamId) &&
    (tmbInfo.permission.isOwner || tmbInfo.permission.hasManagePer);

  // 3. 短路：Dataset 未配置 collection 自定义权限（flag 非 true，含旧数据 undefined）→
  //    Collection 有效权限直接等于 Dataset 有效权限（父 owner 不透传，cap 为 manage）。
  //    写路径不变量保证：任何产生独立/自定义 collection 权限的操作必 mark flag=true，
  //    故 flag!==true ⟺ 纯继承，与 listV2/RAG 短路语义一致（避免列表可见但详情拒绝）。
  const flagSetCollectionPermissions = dataset.hasSetCollectionPermissions;

  // 4. Collection 维度解析：物化快照直读（无父链递归）。
  let role: PermissionValueType;
  if (isTeamOwnerOrAdmin) {
    role = ManageRoleVal;
  } else if (flagSetCollectionPermissions !== true) {
    const isCollectionOwner = String(collection.tmbId) === String(tmbId);
    const datasetRole = dataset.permission.role;
    role =
      datasetRole === OwnerRoleVal ? ManageRoleVal : isCollectionOwner ? OwnerRoleVal : datasetRole;
  } else {
    role = await resolveCollectionPermission({
      collection,
      tmbId,
      teamId
    });
  }

  const isOwner = String(collection.tmbId) === String(tmbId);

  const permission = new CollectionPermission({
    role,
    isOwner
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
  }

  return {
    userId,
    teamId,
    tmbId,
    collection,
    permission,
    isRoot: isRootFromHeader
  };
}

/*
  DatasetData permission is inherited from collection.
*/
export async function authDatasetData({
  dataId,
  ...props
}: AuthModeType & {
  dataId: string;
}) {
  // get mongo dataset.data
  const datasetData = await MongoDatasetData.findById(dataId);

  if (!datasetData) {
    return Promise.reject(i18nT('common:core.dataset.error.Data not found'));
  }

  const result = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  const data: DatasetDataItemType = {
    id: String(datasetData._id),
    teamId: datasetData.teamId,
    updateTime: datasetData.updateTime,
    q: datasetData.q,
    a: datasetData.a,
    imageId: datasetData.imageId,
    imagePreivewUrl:
      datasetData.imageId && isS3ObjectKey(datasetData.imageId, 'dataset')
        ? (
            await getS3DatasetSource().createGetDatasetFileURL({
              key: datasetData.imageId,
              expiredHours: 1,
              external: true
            })
          ).url
        : undefined,
    chunkIndex: datasetData.chunkIndex,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    metadata: datasetData.metadata,
    sourceName: result.collection.name || '',
    sourceId: result.collection?.fileId || result.collection?.rawLink,
    isOwner: String(datasetData.tmbId) === String(result.tmbId)
    // permission: result.permission
  };

  return {
    ...result,
    datasetData: data,
    collection: result.collection
  };
}
