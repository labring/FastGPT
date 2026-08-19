import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoAgentSkills } from '../../../core/ai/skill/model/schema';
import { MongoTeam } from '../../user/team/teamSchema';
import type { Model } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { resourcePermissionRepo } from '../repository/resourcePermissionRepo';
import {
  calculateInheritedResourceCollaborators,
  mergeResourceCollaborators
} from '../resourcePermissionPolicy';

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

export type MaterializeResourcePermissionsOptions = {
  dryRun: boolean;
  teamId?: string;
  batchSize: number;
};

export type MaterializeResourcePermissionsResult = {
  dryRun: boolean;
  teamCount: number;
  resourceCount: number;
  updatedResourceCount: number;
  skippedResourceCount: number;
  errors: string[];
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

export const resolveMaterializedResourcePermissions = ({
  resources,
  currentPermissions,
  resourceType
}: {
  resources: MigrationResource[];
  currentPermissions: MigrationPermission[];
  resourceType: PerResourceTypeEnum;
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

    if (parentId && resource.inheritPermission !== false) {
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

  const changes = resources.flatMap<MaterializedResourcePermissionChange>((resource) => {
    const resourceId = String(resource._id);
    const next = resolve(resourceId);
    if (!next) return [];
    const current = currentPermissionMap.get(resourceId) ?? [];
    if (isSameCollaborators(current, next)) return [];
    return [{ resourceId, collaborators: next }];
  });

  return {
    changes,
    skippedResourceCount: skipped.size,
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
  const resources = await config.model
    .find({ teamId }, '_id teamId parentId tmbId inheritPermission')
    .lean<MigrationResource[]>();
  result.resourceCount += resources.length;
  if (resources.length === 0) return;

  const currentPermissions = await resourcePermissionRepo.findByResourceIds({
    teamId,
    resourceType: config.resourceType,
    resourceIds: resources.map((resource) => String(resource._id))
  });
  const { changes, skippedResourceCount, errors } = resolveMaterializedResourcePermissions({
    resources,
    currentPermissions,
    resourceType: config.resourceType
  });

  result.skippedResourceCount += skippedResourceCount;
  result.updatedResourceCount += changes.length;
  result.errors.push(...errors);
  if (options.dryRun || changes.length === 0) return;

  for (let index = 0; index < changes.length; index += options.batchSize) {
    const batch = changes.slice(index, index + options.batchSize);
    await mongoSessionRun(async (session) => {
      for (const item of batch) {
        await resourcePermissionRepo.replaceResource({
          teamId,
          resourceType: config.resourceType,
          resourceId: item.resourceId,
          collaborators: item.collaborators,
          session
        });
      }
    });
  }
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

  for (const team of teams) {
    const teamId = String(team._id);
    for (const config of resourceConfigs) {
      await materializeResourceType({ teamId, config, options, result });
    }
  }

  return result;
};
