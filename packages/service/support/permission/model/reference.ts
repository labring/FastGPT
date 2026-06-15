import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoResourcePermission } from '../../permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export type ModelReference = {
  resourceType: 'app' | 'dataset';
  resourceId: string;
  resourceName: string;
  creatorTmbId: string;
  creatorName: string;
};

/**
 * Find apps and datasets that reference a given model ID and have been shared with collaborators.
 * Used to warn model owners before they revoke model permissions.
 */
export async function findReferencingResources(
  modelId: string,
  teamId: string
): Promise<ModelReference[]> {
  // 1. Find apps that reference this model in their workflow nodes
  // Use MongoDB nested array matching to find modules with inputs containing the modelId
  const apps = await MongoApp.find(
    {
      teamId,
      deleteTime: null,
      modules: {
        $elemMatch: {
          inputs: {
            $elemMatch: {
              value: modelId
            }
          }
        }
      }
    },
    'name tmbId modules chatConfig'
  ).lean();

  // Filter apps that actually reference the model (exact match, not substring)
  const filteredApps = apps.filter((app) => {
    const modelIds = extractWorkflowModelIds({
      modules: app.modules,
      chatConfig: app.chatConfig
    });
    return modelIds.includes(modelId);
  });

  // 2. Find datasets that reference this model directly
  const datasets = await MongoDataset.find(
    {
      teamId,
      deleteTime: null,
      $or: [{ vectorModelId: modelId }, { agentModelId: modelId }, { vlmModelId: modelId }]
    },
    'name tmbId'
  ).lean();

  // Combine all candidate resources
  const candidates: {
    resourceType: 'app' | 'dataset';
    resourceId: string;
    resourceName: string;
    ownerTmbId: string;
  }[] = [
    ...filteredApps.map((app) => ({
      resourceType: 'app' as const,
      resourceId: String(app._id),
      resourceName: app.name,
      ownerTmbId: String(app.tmbId)
    })),
    ...datasets.map((ds) => ({
      resourceType: 'dataset' as const,
      resourceId: String(ds._id),
      resourceName: ds.name,
      ownerTmbId: String(ds.tmbId)
    }))
  ];

  if (candidates.length === 0) return [];

  // Batch query: fetch all permissions for all candidate resources in one query
  const permissionResourceIds = candidates.map((c) => c.resourceId);
  const permissions = await MongoResourcePermission.find(
    {
      resourceType: { $in: [PerResourceTypeEnum.app, PerResourceTypeEnum.dataset] },
      resourceId: { $in: permissionResourceIds },
      teamId,
      permission: { $gte: ReadPermissionVal }
    },
    'resourceId tmbId'
  ).lean();

  // In-memory: determine which resources have collaborators (permission from non-owner)
  const ownerMap = new Map(candidates.map((c) => [c.resourceId, c.ownerTmbId]));
  const resourceHasCollaborator = new Set<string>();
  for (const perm of permissions) {
    const ownerTmbId = ownerMap.get(perm.resourceId);
    if (ownerTmbId && perm.tmbId !== ownerTmbId) {
      resourceHasCollaborator.add(perm.resourceId);
    }
  }

  // Filter to only resources with collaborators
  const resourcesWithCollaborators = candidates.filter((c) =>
    resourceHasCollaborator.has(c.resourceId)
  );

  if (resourcesWithCollaborators.length === 0) return [];

  // Batch query: fetch all creator names in one query
  const tmbIds = [...new Set(resourcesWithCollaborators.map((c) => c.ownerTmbId))];
  const members = await MongoTeamMember.find({ _id: { $in: tmbIds } }, 'name').lean();
  const nameMap = new Map(members.map((m) => [String(m._id), m.name || '']));

  // Build results
  return resourcesWithCollaborators.map((c) => ({
    resourceType: c.resourceType,
    resourceId: c.resourceId,
    resourceName: c.resourceName,
    creatorTmbId: c.ownerTmbId,
    creatorName: nameMap.get(c.ownerTmbId) || ''
  }));
}
