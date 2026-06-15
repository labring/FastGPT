import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';

export type ModelReference = {
  resourceType: 'app' | 'dataset';
  resourceId: string;
  resourceName: string;
  creatorTmbId: string;
  creatorName: string;
};

/**
 * Find all apps and datasets that reference a given model ID.
 * Used to warn model owners before they revoke model permissions or delete the model.
 */
export async function findReferencingResources(
  modelId: string,
  teamId: string
): Promise<ModelReference[]> {
  // 1. Find apps that reference this model in their workflow nodes
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

  // Batch query: fetch all creator names in one query
  const tmbIds = [...new Set(candidates.map((c) => c.ownerTmbId))];
  const members = await MongoTeamMember.find({ _id: { $in: tmbIds } }, 'name').lean();
  const nameMap = new Map(members.map((m) => [String(m._id), m.name || '']));

  // Build results
  return candidates.map((c) => ({
    resourceType: c.resourceType,
    resourceId: c.resourceId,
    resourceName: c.resourceName,
    creatorTmbId: c.ownerTmbId,
    creatorName: nameMap.get(c.ownerTmbId) || ''
  }));
}
