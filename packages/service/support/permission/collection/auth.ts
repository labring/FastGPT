import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';
import { getTmbPermission } from '../controller';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

/**
 * The minimal fields of a `dataset_collections` document that are required to
 * resolve collection-level permissions.
 */
export type CollectionPermissionItemType = Pick<
  DatasetCollectionSchemaType,
  '_id' | 'tmbId' | 'parentId' | 'inheritPermission' | 'type' | 'datasetId'
>;

/**
 * Resolve the effective permission of a single Collection for a team member.
 *
 * 全快照模型下，Collection 的 `resource_permissions` 已存完整有效协作者快照（父级贡献已并入），
 * 因此直接读自身快照即可，无需向上递归合并父级。`getTmbPermission` 内部解析个人/用户组/组织记录。
 */
export async function resolveCollectionPermission({
  collection,
  tmbId,
  teamId
}: {
  collection: CollectionPermissionItemType;
  tmbId: string;
  teamId: string;
}): Promise<PermissionValueType> {
  return (
    (await getTmbPermission({
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      tmbId,
      resourceId: String(collection._id)
    })) ?? NullRoleVal
  );
}

/**
 * Construct the MongoResourcePermission query that matches the current member's
 * records for a batch of collection resourceIds.
 *
 * It filters by `resourceId: { $in }` + `$or` (tmbId / groupId / orgId), and uses
 * `permission: { $bitsAnySet: 0b111 }` on the query side so only records that hit
 * a standard role (read=0b100 / write=0b010 / manage=0b001) are kept; the owner's
 * full-bit value (4294967295) naturally matches. `permission = 0` deny-records and
 * high-bit-only custom roles are excluded here, avoiding a "record exists => readable"
 * bypass.
 *
 * NOTE (`$bitsAnySet` / owner double): the owner permission is
 * `~0 >>> 0` = 4294967295, which exceeds int32. Verified against a real MongoDB
 * (mongodb-memory-server): it is stored as a numeric value and `$bitsAnySet: 0b111`
 * matches owner records without error.
 */
export function buildPermissionQuery({
  teamId,
  resourceIds,
  tmbId,
  groupIds,
  orgIds
}: {
  teamId: string;
  resourceIds: string[];
  tmbId: string;
  groupIds: string[];
  orgIds: string[];
}): Record<string, unknown> {
  return {
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: { $in: resourceIds },
    permission: { $bitsAnySet: 0b111 },
    $or: [
      { tmbId },
      ...(groupIds.length ? [{ groupId: { $in: groupIds } }] : []),
      ...(orgIds.length ? [{ orgId: { $in: orgIds } }] : [])
    ]
  };
}

/**
 * Batch-compute the readable (effective permission >= read) Collection IDs, shared
 * by list, detail and RAG recall.
 *
 * 全快照模型下，每个 Collection 的快照都是完整有效权限，因此可读性判定只需查询目标
 * Collection 自身的 `resource_permissions`（`buildPermissionQuery` 的 `$bitsAnySet`
 * 在查询端完成过滤），无需再加载父 Folder / Dataset 做继承判定。以候选集合 `$in` 限定，
 * 查询范围与候选集合同量级，不做团队全量扫描。
 *
 * `hasSetCollectionPermissions !== true`（false 或旧数据 undefined）时短路为 Dataset 级鉴权（纯继承 → 全部可读）。
 */
export async function getReadableCollectionIds({
  collections,
  tmbId,
  teamId,
  groupIds,
  orgIds,
  datasetPermission,
  hasSetCollectionPermissions
}: {
  collections: CollectionPermissionItemType[];
  tmbId: string;
  teamId: string;
  groupIds: string[];
  orgIds: string[];
  /** Dataset 有效角色（role 位掩码），仅用于纯继承短路。 */
  datasetPermission: PermissionValueType;
  /** 所属 Dataset 是否配置过 Collection 级权限：`false` 时短路为 Dataset 级鉴权。 */
  hasSetCollectionPermissions?: boolean;
}): Promise<string[]> {
  if (collections.length === 0) return [];

  const datasetHasRead =
    datasetPermission != null &&
    new Permission({ role: datasetPermission, isOwner: false }).checkPer(ReadRoleVal);

  // 短路：Dataset 下无任何 Collection 自定义权限（纯继承）→ 调用方已通过 Dataset read 门槛，
  // 全部 Collection 可读，无需批量权限查询。flag 非 true（含旧数据 undefined）即纯继承，
  // 依赖写路径不变量：任何产生自定义 collection 权限的写操作必 mark flag=true。
  if (hasSetCollectionPermissions !== true) {
    return datasetHasRead ? collections.map((item) => String(item._id)) : [];
  }

  const readableResourceIds = new Set(
    (
      await MongoResourcePermission.distinct(
        'resourceId',
        buildPermissionQuery({
          teamId,
          resourceIds: collections.map((item) => String(item._id)),
          tmbId,
          groupIds,
          orgIds
        })
      )
    ).map(String)
  );

  return collections
    .filter((item) => readableResourceIds.has(String(item._id)))
    .map((item) => String(item._id));
}

/**
 * 判断 Collection 级权限是否可整体短路（无需逐 collection 解析）：
 * - 团队 owner/admin：对该团队全部 dataset 可读；
 * - 普通成员：所有目标 Dataset 均未配置 collection 自定义权限（flag 非 true，含旧数据
 *   undefined），每个 Collection 有效权限 = Dataset 有效权限。
 *
 * 满足时返回 `true`，调用方（RAG 检索 / Collection 列表）可跳过 collection 权限过滤。
 * 前置条件：调用方已按 Dataset read 过滤 `datasetIds`；本函数不做 Dataset read 鉴权。
 */
export async function canShortCircuitCollectionPermission({
  teamId,
  datasetIds,
  tmbId,
  tmbInfo
}: {
  teamId: string;
  datasetIds: string[];
  tmbId: string;
  /** 可选：已解析的 tmb 信息，避免重复查询。 */
  tmbInfo?: Awaited<ReturnType<typeof getTmbInfoByTmbId>>;
}): Promise<boolean> {
  if (datasetIds.length === 0) return true;

  const info = tmbInfo ?? (await getTmbInfoByTmbId({ tmbId }));
  if (String(info.teamId) !== String(teamId)) return false;
  if (info.permission.isOwner || info.permission.hasManagePer) return true;

  // 普通成员：全部 Dataset 均未配置 collection 自定义权限（flag 非 true，含旧数据 undefined）
  // 才短路。不变量：任何写路径产生自定义 collection 权限必 mark flag=true，故 flag!==true ⟺ 纯继承。
  const datasets = await MongoDataset.find(
    { _id: { $in: datasetIds } },
    'hasSetCollectionPermissions'
  ).lean();
  const flags = new Map<string, boolean | undefined>(
    datasets.map((ds) => [String(ds._id), ds.hasSetCollectionPermissions])
  );
  return datasetIds.every((id) => flags.get(id) !== true);
}

/**
 * 多 Dataset 可读 Collection 解析（检索 / 列表共用）。
 *
 * 语义：返回 `undefined` 表示「无需 collection 级过滤」（短路 / 全部可读），
 * 返回字符串数组表示「仅这些 file collection 可读」的真子集。
 *  - 团队 owner/admin：`undefined`（无 collection 级过滤，按 dataset 召回）；
 *  - 全部目标 dataset 未配置 collection 自定义权限（flag 非 true，含旧数据 undefined）：
 *    `undefined`（纯继承短路）；
 *  - 否则：加载目标 dataset 下 file collection 最小字段，逐 dataset 并行
 *    `getReadableCollectionIds`（候选 `$in` 限定，无 N+1）取并集；并集覆盖全部 file
 *    collection 时仍返回 `undefined`（避免上万 ID 长过滤条件），真子集才返回可读 ID 列表。
 *
 * 前置条件：调用方已按 Dataset read 过滤 `datasetIds`；
 * 纯继承 dataset 在 `getReadableCollectionIds` 内以 ReadRoleVal 短路为「全部可读」。
 */
export async function resolveReadableCollectionIds({
  teamId,
  datasetIds,
  tmbId,
  tmbInfo
}: {
  teamId: string;
  datasetIds: string[];
  tmbId: string;
  /** 可选：已解析的 tmb 信息，避免重复查询。 */
  tmbInfo?: Awaited<ReturnType<typeof getTmbInfoByTmbId>>;
}): Promise<string[] | undefined> {
  if (datasetIds.length === 0) return undefined;

  // 团队 owner/admin 或全部纯继承 → 短路，无需 collection 级过滤
  if (await canShortCircuitCollectionPermission({ teamId, datasetIds, tmbId, tmbInfo })) {
    return undefined;
  }

  // 加载目标 dataset 下全部 file collection 最小字段（folder 无 chunk，不参与召回过滤）
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId: { $in: datasetIds }, type: { $ne: DatasetCollectionTypeEnum.folder } },
    '_id datasetId tmbId parentId inheritPermission type'
  ).lean<CollectionPermissionItemType[]>();
  if (collections.length === 0) return undefined;

  const datasets = await MongoDataset.find(
    { _id: { $in: datasetIds } },
    'hasSetCollectionPermissions'
  ).lean();
  const flagMap = new Map<string, boolean | undefined>(
    datasets.map((ds) => [String(ds._id), ds.hasSetCollectionPermissions])
  );

  // 按 datasetId 分组，逐 dataset 并行解析可读 ID（各 dataset 独立、候选 `$in` 限定）
  const byDataset = new Map<string, CollectionPermissionItemType[]>();
  for (const collection of collections) {
    const datasetId = String(collection.datasetId);
    const list = byDataset.get(datasetId) ?? [];
    list.push(collection);
    byDataset.set(datasetId, list);
  }

  const [groupIds, orgIds] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }).then((list) => list.map((item) => String(item._id))),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
  ]);

  const readableNested = await Promise.all(
    Array.from(byDataset.entries()).map(([datasetId, datasetCollections]) =>
      getReadableCollectionIds({
        collections: datasetCollections,
        tmbId,
        teamId,
        groupIds,
        orgIds: Array.from(orgIds),
        // 前置条件已保证 dataset read 通过；纯继承 dataset 在此短路为全部可读
        datasetPermission: ReadRoleVal,
        hasSetCollectionPermissions: flagMap.get(datasetId)
      })
    )
  );

  const readableIds = Array.from(new Set(readableNested.flat()));
  // 可读并集覆盖全部 file collection → 不设过滤（避免上万 ID 长过滤条件）
  if (readableIds.length === collections.length) return undefined;

  return readableIds;
}
