import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import type { ClientSession, Model } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  calculateInheritedResourceCollaborators,
  mergeResourceCollaborators,
  shouldInheritResourcePermission
} from '@fastgpt/service/support/permission/resourcePermissionPolicy';
import {
  MaterializeResourcePermissionsResultSchema,
  type MaterializeResourcePermissionsOptions,
  type MaterializeResourcePermissionsResult
} from './permissionSchema';

const logger = getLogger(LogCategories.MODULE.PERMISSION);

export type MigrationResource = {
  _id: unknown;
  teamId: unknown;
  parentId?: unknown;
  tmbId?: unknown;
  inheritPermission?: boolean;
};

type MigrationPermission = CollaboratorItemType & {
  resourceId: unknown;
};

export type MaterializedResourcePermissionChange = {
  resourceId: string;
  collaborators: CollaboratorItemType[];
};

type MigrationResourceConfig = {
  resourceType: PerResourceTypeEnum;
  model: Model<any>;
};

const resourceConfigs: MigrationResourceConfig[] = [
  { resourceType: PerResourceTypeEnum.app, model: MongoApp },
  { resourceType: PerResourceTypeEnum.dataset, model: MongoDataset },
  { resourceType: PerResourceTypeEnum.agentSkill, model: MongoAgentSkills }
];

const toId = (value: unknown) => (value == null ? undefined : String(value));

const createOwnerCollaborators = (resource: MigrationResource): CollaboratorItemType[] => {
  const tmbId = toId(resource.tmbId);
  return tmbId ? [{ tmbId, permission: OwnerRoleVal }] : [];
};

const isSameCollaborators = (left: CollaboratorItemType[], right: CollaboratorItemType[]) => {
  if (left.length !== right.length) return false;
  const rightMap = new Map(
    right.map((collaborator) => [
      `${collaborator.tmbId ?? ''}:${collaborator.groupId ?? ''}:${collaborator.orgId ?? ''}`,
      collaborator.permission
    ])
  );
  return left.every((collaborator) => {
    const key = `${collaborator.tmbId ?? ''}:${collaborator.groupId ?? ''}:${collaborator.orgId ?? ''}`;
    return rightMap.get(key) === collaborator.permission;
  });
};

/**
 * 计算资源的完整有效 ACL；提供 targetResourceIds 时，父级只作为当前批次的计算上下文。
 */
export const resolveMaterializedResourcePermissions = ({
  resources,
  currentPermissions,
  resourceType,
  targetResourceIds
}: {
  resources: MigrationResource[];
  currentPermissions: MigrationPermission[];
  resourceType: PerResourceTypeEnum;
  targetResourceIds?: string[];
}) => {
  const resourceMap = new Map(resources.map((resource) => [String(resource._id), resource]));
  const currentPermissionMap = new Map<string, CollaboratorItemType[]>();
  for (const permission of currentPermissions) {
    const list = currentPermissionMap.get(String(permission.resourceId)) ?? [];
    list.push(permission);
    currentPermissionMap.set(String(permission.resourceId), list);
  }

  const errors: string[] = [];
  const materialized = new Map<string, CollaboratorItemType[]>();
  const visiting = new Set<string>();
  const skipped = new Set<string>();

  const resolve = (resourceId: string): CollaboratorItemType[] | undefined => {
    const existing = materialized.get(resourceId);
    if (existing) return existing;
    if (skipped.has(resourceId)) return;
    if (visiting.has(resourceId)) {
      errors.push(`${resourceType}:${resourceId}: parent cycle`);
      skipped.add(resourceId);
      return;
    }

    const resource = resourceMap.get(resourceId);
    if (!resource) {
      errors.push(`${resourceType}:${resourceId}: missing resource`);
      skipped.add(resourceId);
      return;
    }

    visiting.add(resourceId);
    const current = currentPermissionMap.get(resourceId) ?? [];
    const parentId = toId(resource.parentId);
    const parent = parentId ? resourceMap.get(parentId) : undefined;
    const childCollaborators = mergeResourceCollaborators({
      parentCollaborators: [],
      childCollaborators: [...current, ...createOwnerCollaborators(resource)]
    });
    let next = childCollaborators;

    if (parentId && shouldInheritResourcePermission(resource.inheritPermission)) {
      const parentPermissions = parent ? resolve(parentId) : undefined;
      if (!parentPermissions) {
        errors.push(`${resourceType}:${resourceId}: missing parent ${parentId}`);
        skipped.add(resourceId);
        visiting.delete(resourceId);
        return;
      }
      next = calculateInheritedResourceCollaborators({
        oldParentCollaborators: parentPermissions,
        newParentCollaborators: parentPermissions,
        childCollaborators
      });
    }

    visiting.delete(resourceId);
    materialized.set(resourceId, next);
    return next;
  };

  const targetResourceIdSet = targetResourceIds ? new Set(targetResourceIds) : undefined;
  const targetResources = targetResourceIdSet
    ? resources.filter((resource) => targetResourceIdSet.has(String(resource._id)))
    : resources;
  const changes = targetResources.flatMap<MaterializedResourcePermissionChange>((resource) => {
    const resourceId = String(resource._id);
    const next = resolve(resourceId);
    if (!next) return [];
    const current = currentPermissionMap.get(resourceId) ?? [];
    if (isSameCollaborators(current, next)) return [];
    return [{ resourceId, collaborators: next }];
  });

  return {
    changes,
    skippedResourceCount: targetResources.filter((resource) => skipped.has(String(resource._id)))
      .length,
    errors
  };
};

const materializeResourceType = async ({
  teamId,
  config,
  options,
  result
}: {
  teamId: string;
  config: MigrationResourceConfig;
  options: MaterializeResourcePermissionsOptions;
  result: MaterializeResourcePermissionsResult;
}) => {
  const projection = '_id teamId parentId tmbId inheritPermission';

  /** 在同一事务快照中加载目标资源和计算其有效 ACL 所需的祖先链。 */
  const loadResourceBatch = async (targetResourceIds: string[], session?: ClientSession) => {
    const targetQuery = config.model.find({ teamId, _id: { $in: targetResourceIds } }, projection);
    if (session) targetQuery.session(session);
    const targetResources = await targetQuery.lean<MigrationResource[]>();
    const resourcesById = new Map(
      targetResources.map((resource) => [String(resource._id), resource])
    );
    const pendingParentIds = new Set<string>();
    const queriedParentIds = new Set<string>();

    for (const resource of targetResources) {
      const parentId = resource.parentId == null ? undefined : String(resource.parentId);
      if (parentId && shouldInheritResourcePermission(resource.inheritPermission)) {
        pendingParentIds.add(parentId);
      }
    }

    while (pendingParentIds.size > 0) {
      const parentIds = Array.from(pendingParentIds).filter(
        (parentId) => !resourcesById.has(parentId) && !queriedParentIds.has(parentId)
      );
      pendingParentIds.clear();
      if (parentIds.length === 0) break;
      parentIds.forEach((parentId) => queriedParentIds.add(parentId));

      const ancestorQuery = config.model.find({ teamId, _id: { $in: parentIds } }, projection);
      if (session) ancestorQuery.session(session);
      const ancestors = await ancestorQuery.lean<MigrationResource[]>();
      for (const ancestor of ancestors) {
        resourcesById.set(String(ancestor._id), ancestor);
        const parentId = ancestor.parentId == null ? undefined : String(ancestor.parentId);
        if (parentId && shouldInheritResourcePermission(ancestor.inheritPermission)) {
          pendingParentIds.add(parentId);
        }
      }
    }

    return { resources: Array.from(resourcesById.values()), targetResources };
  };

  const processBatch = async (targetResources: MigrationResource[]) => {
    if (targetResources.length === 0) return;
    const targetResourceIds = targetResources.map((resource) => String(resource._id));
    const executeBatch = async (session?: ClientSession) => {
      const { resources, targetResources: freshTargetResources } = await loadResourceBatch(
        targetResourceIds,
        session
      );
      const currentPermissions = await resourcePermissionRepo.findByResourceIds({
        teamId,
        resourceType: config.resourceType,
        resourceIds: resources.map((resource) => String(resource._id)),
        session
      });
      const { changes, skippedResourceCount, errors } = resolveMaterializedResourcePermissions({
        resources,
        currentPermissions,
        resourceType: config.resourceType,
        targetResourceIds: freshTargetResources.map((resource) => String(resource._id))
      });

      if (!options.dryRun && changes.length === 0) return { changes, skippedResourceCount, errors };
      if (options.dryRun) return { changes, skippedResourceCount, errors };

      await resourcePermissionRepo.replaceResources({
        teamId,
        resourceType: config.resourceType,
        resources: changes,
        session
      });
      return { changes, skippedResourceCount, errors };
    };

    const batchResult = options.dryRun
      ? await executeBatch()
      : await mongoSessionRun((session) => executeBatch(session));

    result.resourceCount += targetResources.length;
    result.skippedResourceCount += batchResult.skippedResourceCount;
    result.updatedResourceCount += batchResult.changes.length;
    for (const error of batchResult.errors) {
      if (!result.errors.includes(error)) result.errors.push(error);
    }
  };

  const cursor = config.model
    .find({ teamId }, projection)
    .sort({ _id: 1 })
    .lean<MigrationResource>()
    .cursor({ batchSize: options.batchSize });
  let batch: MigrationResource[] = [];
  for await (const resource of cursor) {
    batch.push(resource);
    if (batch.length < options.batchSize) continue;
    await processBatch(batch);
    batch = [];
  }
  await processBatch(batch);
};

/**
 * 将 app、dataset、agent skill 的权限补齐为每个资源的完整有效 ACL。
 * 迁移只在 `dryRun=false` 时写库，异常树节点会保留原数据并进入 errors。
 */
export const materializeResourcePermissions = async (
  options: MaterializeResourcePermissionsOptions
): Promise<MaterializeResourcePermissionsResult> => {
  const teams = await MongoTeam.find(options.teamId ? { _id: options.teamId } : {}, '_id').lean();
  const result: MaterializeResourcePermissionsResult = {
    dryRun: options.dryRun,
    teamCount: teams.length,
    resourceCount: 0,
    updatedResourceCount: 0,
    skippedResourceCount: 0,
    errors: []
  };

  let processedTeamCount = 0;
  await batchRun(
    teams,
    async (team) => {
      const teamId = String(team._id);
      let failedResourceTypeCount = 0;

      for (const config of resourceConfigs) {
        try {
          await materializeResourceType({ teamId, config, options, result });
        } catch (error) {
          failedResourceTypeCount += 1;
          const migrationError = `${config.resourceType}:${teamId}: migration failed: ${getErrText(
            error,
            'unknown error'
          )}`;
          if (!result.errors.includes(migrationError)) result.errors.push(migrationError);

          logger.error('Resource permission materialization failed', {
            teamId,
            resourceType: config.resourceType,
            error
          });
        }
      }

      processedTeamCount += 1;
      console.log('Resource permission materialization progress', {
        processedTeamCount,
        totalTeamCount: teams.length,
        progress: Number(((processedTeamCount / teams.length) * 100).toFixed(2)),
        teamId,
        failedResourceTypeCount
      });
    },
    options.teamConcurrency
  );

  return MaterializeResourcePermissionsResultSchema.parse(result);
};
