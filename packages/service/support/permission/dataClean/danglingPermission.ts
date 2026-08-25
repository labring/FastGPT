import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  CleanupDanglingResourcePermissionsResponseSchema,
  type CleanupDanglingResourcePermissionsOptions,
  type CleanupDanglingResourcePermissionsResult,
  type DanglingReferenceReason
} from '@fastgpt/global/support/permission/dataClean/controller.schema';
import { Types } from '../../../common/mongo';
import { MongoAgentSkills } from '../../../core/ai/skill/model/schema';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoMemberGroupModel } from '../memberGroup/memberGroupSchema';
import { MongoOrgModel } from '../org/orgSchema';
import { MongoResourcePermission } from '../schema';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { MongoTeam } from '../../user/team/teamSchema';

type PermissionReferenceDoc = {
  _id: Types.ObjectId;
  teamId?: unknown;
  tmbId?: unknown;
  groupId?: unknown;
  orgId?: unknown;
  resourceType: string;
  resourceId?: unknown;
};

type TeamScopedReferenceDoc = {
  _id: unknown;
  teamId: unknown;
};

type DanglingPermission = {
  permission: PermissionReferenceDoc;
  reasons: DanglingReferenceReason[];
};

const permissionSnapshotFields = [
  'teamId',
  'tmbId',
  'groupId',
  'orgId',
  'resourceType',
  'resourceId'
] as const;

const hasOwnField = (document: object, field: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(document, field);

const stringifyId = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
};

const compactUniqueIds = (values: unknown[]) => {
  const idMap = new Map<string, unknown>();
  for (const value of values) {
    const id = stringifyId(value);
    if (id && Types.ObjectId.isValid(id)) idMap.set(id, value);
  }
  return Array.from(idMap.values());
};

const toTeamScopedReferenceKey = (id: unknown, teamId: unknown) =>
  `${stringifyId(id)}:${stringifyId(teamId)}`;

const toTeamScopedReferenceSet = (documents: TeamScopedReferenceDoc[]) =>
  new Set(documents.map((document) => toTeamScopedReferenceKey(document._id, document.teamId)));

const createReasonCounts = (): Record<DanglingReferenceReason, number> => ({
  missingTeam: 0,
  missingTeamMember: 0,
  missingGroup: 0,
  missingOrg: 0,
  missingApp: 0,
  missingDataset: 0,
  missingAgentSkill: 0,
  missingResourceId: 0,
  missingCollaboratorTarget: 0,
  multipleCollaboratorTargets: 0
});

const resourceReferenceConfigs = [
  {
    resourceType: PerResourceTypeEnum.app,
    missingReason: 'missingApp' as const,
    findExisting: (ids: unknown[]) =>
      MongoApp.find({ _id: { $in: ids } }, '_id teamId').lean<TeamScopedReferenceDoc[]>()
  },
  {
    resourceType: PerResourceTypeEnum.dataset,
    missingReason: 'missingDataset' as const,
    findExisting: (ids: unknown[]) =>
      MongoDataset.find({ _id: { $in: ids } }, '_id teamId').lean<TeamScopedReferenceDoc[]>()
  },
  {
    resourceType: PerResourceTypeEnum.agentSkill,
    missingReason: 'missingAgentSkill' as const,
    findExisting: (ids: unknown[]) =>
      MongoAgentSkills.find({ _id: { $in: ids } }, '_id teamId').lean<TeamScopedReferenceDoc[]>()
  }
] as const;

/**
 * 校验一批权限记录的外部引用。
 *
 * 协作者和资源引用同时校验 `_id` 与 `teamId`，跨团队引用与非法 ObjectId 均视为悬垂。
 * `team` 和 `model` 权限没有 `resourceId`；其余资源类型缺少 `resourceId` 时单独报告。
 */
async function findDanglingReferencePermissionsInBatch(
  permissions: PermissionReferenceDoc[]
): Promise<DanglingPermission[]> {
  const teamIds = compactUniqueIds(permissions.map((permission) => permission.teamId));
  const tmbIds = compactUniqueIds(permissions.map((permission) => permission.tmbId));
  const groupIds = compactUniqueIds(permissions.map((permission) => permission.groupId));
  const orgIds = compactUniqueIds(permissions.map((permission) => permission.orgId));

  const [teams, teamMembers, groups, orgs, resourceReferences] = await Promise.all([
    MongoTeam.find({ _id: { $in: teamIds } }, '_id').lean(),
    MongoTeamMember.find({ _id: { $in: tmbIds } }, '_id teamId').lean<TeamScopedReferenceDoc[]>(),
    MongoMemberGroupModel.find({ _id: { $in: groupIds } }, '_id teamId').lean<
      TeamScopedReferenceDoc[]
    >(),
    MongoOrgModel.find({ _id: { $in: orgIds } }, '_id teamId').lean<TeamScopedReferenceDoc[]>(),
    Promise.all(
      resourceReferenceConfigs.map(async (config) => {
        const ids = compactUniqueIds(
          permissions
            .filter((permission) => permission.resourceType === config.resourceType)
            .map((permission) => permission.resourceId)
        );
        const documents = await config.findExisting(ids);
        return [config.resourceType, toTeamScopedReferenceSet(documents)] as const;
      })
    )
  ]);

  const existingTeamIds = new Set(teams.map((team) => stringifyId(team._id)));
  const existingSubjectReferenceSets = {
    tmbId: toTeamScopedReferenceSet(teamMembers),
    groupId: toTeamScopedReferenceSet(groups),
    orgId: toTeamScopedReferenceSet(orgs)
  };
  const subjectReasonMap = {
    tmbId: 'missingTeamMember',
    groupId: 'missingGroup',
    orgId: 'missingOrg'
  } as const;
  const existingResourceReferenceSets = new Map(resourceReferences);

  return permissions.flatMap((permission) => {
    const reasons: DanglingReferenceReason[] = [];
    const teamId = stringifyId(permission.teamId);

    if (!existingTeamIds.has(teamId)) reasons.push('missingTeam');

    for (const field of Object.keys(subjectReasonMap) as (keyof typeof subjectReasonMap)[]) {
      if (
        hasOwnField(permission, field) &&
        !existingSubjectReferenceSets[field].has(
          toTeamScopedReferenceKey(permission[field], permission.teamId)
        )
      ) {
        reasons.push(subjectReasonMap[field]);
      }
    }

    const resourceConfig = resourceReferenceConfigs.find(
      (config) => config.resourceType === permission.resourceType
    );
    if (resourceConfig) {
      const resourceId = stringifyId(permission.resourceId);
      if (!resourceId) {
        reasons.push('missingResourceId');
      } else if (
        !existingResourceReferenceSets
          .get(resourceConfig.resourceType)
          ?.has(toTeamScopedReferenceKey(permission.resourceId, permission.teamId))
      ) {
        reasons.push(resourceConfig.missingReason);
      }
    }

    return reasons.length > 0 ? [{ permission, reasons }] : [];
  });
}

/**
 * 检查协作者目标结构，确保成员、成员组和组织节点三者必须且只能存在一个。
 *
 * 这里按业务 Schema 的真值语义判断；空字符串、`null` 等值不构成有效目标，后续也不能据此
 * 猜测原协作者，因此 apply 模式会直接删除对应权限记录。
 */
function findInvalidCollaboratorPermissionsInBatch(
  permissions: PermissionReferenceDoc[]
): DanglingPermission[] {
  const collaboratorFields = ['tmbId', 'groupId', 'orgId'] as const;

  return permissions.flatMap((permission) => {
    const targetCount = collaboratorFields.filter((field) => Boolean(permission[field])).length;
    const reasons: DanglingReferenceReason[] = (() => {
      if (targetCount === 0) return ['missingCollaboratorTarget'];
      if (targetCount > 1) return ['multipleCollaboratorTargets'];
      return [];
    })();

    return reasons.length > 0 ? [{ permission, reasons }] : [];
  });
}

/** 合并两类检测结果，确保同一权限只统计和删除一次，同时保留全部命中原因。 */
function mergeInvalidPermissions(permissionGroups: DanglingPermission[][]): DanglingPermission[] {
  const permissionMap = new Map<string, DanglingPermission>();

  for (const { permission, reasons } of permissionGroups.flat()) {
    const permissionId = stringifyId(permission._id);
    const existing = permissionMap.get(permissionId);
    if (!existing) {
      permissionMap.set(permissionId, { permission, reasons: [...reasons] });
      continue;
    }

    existing.reasons = Array.from(new Set([...existing.reasons, ...reasons]));
  }

  return Array.from(permissionMap.values());
}

/** 分别执行悬垂引用和协作者结构检测，并返回去重后的待清理权限。 */
async function findInvalidPermissionsInBatch(permissions: PermissionReferenceDoc[]) {
  const danglingReferencePermissions = await findDanglingReferencePermissionsInBatch(permissions);
  const invalidCollaboratorPermissions = findInvalidCollaboratorPermissionsInBatch(permissions);

  return {
    danglingReferencePermissions,
    invalidCollaboratorPermissions,
    invalidPermissions: mergeInvalidPermissions([
      danglingReferencePermissions,
      invalidCollaboratorPermissions
    ])
  };
}

/** 生成包含字段存在性和值的删除条件，避免扫描后的并发更新被误删。 */
const createPermissionSnapshotFilter = (permission: PermissionReferenceDoc) => ({
  $and: [
    { _id: permission._id },
    ...permissionSnapshotFields.flatMap((field) =>
      hasOwnField(permission, field)
        ? [{ [field]: permission[field] }, { [field]: { $exists: true } }]
        : [{ [field]: { $exists: false } }]
    )
  ]
});

/**
 * 分批扫描并清理 `resource_permissions` 中的悬垂引用和非法协作者目标。
 *
 * `cursor` 和 `maxScan` 为单次运行提供边界；apply 模式会在删除前重新校验，并仅删除仍与
 * 扫描快照一致的记录。返回 `nextCursor` 时，下一次调用应原样传回以继续扫描。
 */
export async function cleanupDanglingResourcePermissions(
  options: CleanupDanglingResourcePermissionsOptions
): Promise<CleanupDanglingResourcePermissionsResult> {
  let scannedPermissionCount = 0;
  let danglingPermissionCount = 0;
  let danglingReferencePermissionCount = 0;
  let invalidCollaboratorPermissionCount = 0;
  let deletedPermissionCount = 0;
  let lastScannedId: Types.ObjectId | undefined;
  const reasonCounts = createReasonCounts();
  const samples: CleanupDanglingResourcePermissionsResult['samples'] = [];

  const processBatch = async (permissions: PermissionReferenceDoc[]) => {
    scannedPermissionCount += permissions.length;
    const { danglingReferencePermissions, invalidCollaboratorPermissions, invalidPermissions } =
      await findInvalidPermissionsInBatch(permissions);
    danglingReferencePermissionCount += danglingReferencePermissions.length;
    invalidCollaboratorPermissionCount += invalidCollaboratorPermissions.length;
    danglingPermissionCount += invalidPermissions.length;

    for (const { permission, reasons } of invalidPermissions) {
      for (const reason of reasons) reasonCounts[reason] += 1;
      if (samples.length >= options.sampleLimit) continue;

      samples.push({
        permissionId: stringifyId(permission._id),
        teamId: stringifyId(permission.teamId),
        resourceType: permission.resourceType,
        ...(hasOwnField(permission, 'resourceId')
          ? { resourceId: stringifyId(permission.resourceId) }
          : {}),
        danglingReferences: reasons
      });
    }

    if (!options.dryRun && invalidPermissions.length > 0) {
      const { invalidPermissions: revalidatedPermissions } = await findInvalidPermissionsInBatch(
        invalidPermissions.map(({ permission }) => permission)
      );
      if (revalidatedPermissions.length > 0) {
        const result = await MongoResourcePermission.collection.deleteMany({
          $or: revalidatedPermissions.map(({ permission }) =>
            createPermissionSnapshotFilter(permission)
          )
        });
        deletedPermissionCount += result.deletedCount;
      }
    }
  };

  const query = options.cursor ? { _id: { $gt: new Types.ObjectId(options.cursor) } } : {};
  const permissionCursor = MongoResourcePermission.collection
    .find<PermissionReferenceDoc>(query, {
      projection: {
        _id: 1,
        teamId: 1,
        tmbId: 1,
        groupId: 1,
        orgId: 1,
        resourceType: 1,
        resourceId: 1
      }
    })
    .sort({ _id: 1 })
    .limit(options.maxScan)
    .batchSize(options.batchSize);
  let batch: PermissionReferenceDoc[] = [];

  for await (const permission of permissionCursor) {
    batch.push(permission);
    lastScannedId = permission._id;
    if (batch.length < options.batchSize) continue;

    await processBatch(batch);
    batch = [];
  }
  if (batch.length > 0) await processBatch(batch);

  const hasMore = lastScannedId
    ? Boolean(
        await MongoResourcePermission.collection.findOne(
          { _id: { $gt: lastScannedId } },
          { projection: { _id: 1 } }
        )
      )
    : false;

  return CleanupDanglingResourcePermissionsResponseSchema.parse({
    dryRun: options.dryRun,
    scannedPermissionCount,
    danglingPermissionCount,
    danglingReferencePermissionCount,
    invalidCollaboratorPermissionCount,
    deletedPermissionCount,
    reasonCounts,
    batchSize: options.batchSize,
    maxScan: options.maxScan,
    sampleLimit: options.sampleLimit,
    ...(hasMore ? { nextCursor: stringifyId(lastScannedId) } : {}),
    samples
  });
}
