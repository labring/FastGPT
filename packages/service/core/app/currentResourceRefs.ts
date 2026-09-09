import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import type { ClientSession } from '../../common/mongo';
import { MongoApp } from './schema';

export type AppCurrentResourceRefType = 'dataset' | 'tool' | 'skill';

export type AppCurrentResourceRefs = {
  datasetIds: string[];
  toolIds: string[];
  skillIds: string[];
};

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  return value as Record<string, unknown>;
};

const addDatasetIds = (target: Set<string>, value: unknown) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  list.forEach((item) => {
    const datasetId = toRecord(item)?.datasetId;
    if (typeof datasetId === 'string' && datasetId) target.add(datasetId);
  });
};

const addToolId = (target: Set<string>, value: unknown) => {
  if (typeof value !== 'string' || !value) return;

  try {
    target.add(getToolRawId(value));
  } catch {
    // Historical custom tools may store a raw id that the current codec cannot classify.
    target.add(value);
  }
};

/**
 * Extract references from the workflow currently stored on an App document.
 * Unlike `resourceRefs`, this represents the latest draft and therefore changes on autosave.
 */
export const extractCurrentAppResourceRefsFromNodes = (
  nodes: StoreNodeItemType[] | null | undefined = []
): AppCurrentResourceRefs => {
  const datasetIds = new Set<string>();
  const toolIds = new Set<string>();
  const skillIds = new Set<string>();

  for (const node of Array.isArray(nodes) ? nodes : []) {
    addToolId(toolIds, node.pluginId);
    addToolId(toolIds, node.toolConfig?.mcpTool?.toolId);
    addToolId(toolIds, node.toolConfig?.httpTool?.toolId);
    addToolId(
      toolIds,
      node.toolConfig?.mcpToolSet && 'toolId' in node.toolConfig.mcpToolSet
        ? node.toolConfig.mcpToolSet.toolId
        : undefined
    );
    addToolId(
      toolIds,
      node.toolConfig?.httpToolSet && 'toolId' in node.toolConfig.httpToolSet
        ? node.toolConfig.httpToolSet.toolId
        : undefined
    );

    for (const input of node.inputs ?? []) {
      if (nodeInputIsReference(input)) continue;

      if (input.key === NodeInputKeyEnum.datasetSelectList) {
        addDatasetIds(datasetIds, input.value);
      }
      if (input.key === NodeInputKeyEnum.datasetParams) {
        addDatasetIds(datasetIds, toRecord(input.value)?.datasets);
      }
      if (input.key === NodeInputKeyEnum.skills) {
        const skills = Array.isArray(input.value) ? input.value : input.value ? [input.value] : [];
        skills.forEach((item) => {
          const skillId = toRecord(item)?.skillId;
          if (typeof skillId === 'string' && skillId) skillIds.add(skillId);
        });
      }
      if (input.key === NodeInputKeyEnum.selectedTools && Array.isArray(input.value)) {
        input.value.forEach((item) => addToolId(toolIds, toRecord(item)?.id));
      }
    }
  }

  return {
    datasetIds: Array.from(datasetIds),
    toolIds: Array.from(toolIds),
    skillIds: Array.from(skillIds)
  };
};

const resourceRefKeyMap = {
  dataset: 'datasetIds',
  tool: 'toolIds',
  skill: 'skillIds'
} as const satisfies Record<AppCurrentResourceRefType, keyof AppCurrentResourceRefs>;

const buildInputRefQuery = ({
  resourceType,
  resourceIds
}: {
  resourceType: AppCurrentResourceRefType;
  resourceIds: string[];
}) => {
  if (resourceType === 'dataset') {
    return {
      $or: [
        {
          modules: {
            $elemMatch: {
              inputs: {
                $elemMatch: {
                  key: NodeInputKeyEnum.datasetSelectList,
                  'value.datasetId': { $in: resourceIds }
                }
              }
            }
          }
        },
        {
          modules: {
            $elemMatch: {
              inputs: {
                $elemMatch: {
                  key: NodeInputKeyEnum.datasetParams,
                  'value.datasets.datasetId': { $in: resourceIds }
                }
              }
            }
          }
        }
      ]
    };
  }

  if (resourceType === 'skill') {
    return {
      modules: {
        $elemMatch: {
          inputs: {
            $elemMatch: {
              key: NodeInputKeyEnum.skills,
              'value.skillId': { $in: resourceIds }
            }
          }
        }
      }
    };
  }

  const escapedIds = resourceIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const toolIds = resourceIds.flatMap((id) => [id, `personal-${id}`]);
  const toolSetPatterns = escapedIds.flatMap((id) => [
    new RegExp(`^mcp-${id}(?:/|$)`),
    new RegExp(`^http-${id}(?:/|$)`)
  ]);
  const condition = { $in: [...toolIds, ...toolSetPatterns] };

  return {
    $or: [
      { 'modules.pluginId': condition },
      { 'modules.toolConfig.mcpTool.toolId': condition },
      { 'modules.toolConfig.httpTool.toolId': condition },
      { 'modules.toolConfig.mcpToolSet.toolId': condition },
      { 'modules.toolConfig.httpToolSet.toolId': condition },
      {
        modules: {
          $elemMatch: {
            inputs: {
              $elemMatch: {
                key: NodeInputKeyEnum.selectedTools,
                'value.id': condition
              }
            }
          }
        }
      }
    ]
  };
};

/** Find non-deleted Apps whose latest draft references any requested resource. */
export const findAppsByCurrentResourceRefs = async ({
  teamId,
  resourceType,
  resourceIds,
  excludeAppIds = [],
  session
}: {
  teamId: string;
  resourceType: AppCurrentResourceRefType;
  resourceIds: string[];
  excludeAppIds?: string[];
  session?: ClientSession;
}) => {
  const normalizedIds = Array.from(new Set(resourceIds.filter(Boolean)));
  if (normalizedIds.length === 0) return [];

  const query = MongoApp.find(
    {
      teamId,
      deleteTime: null,
      ...(excludeAppIds.length > 0 ? { _id: { $nin: excludeAppIds } } : {}),
      ...buildInputRefQuery({ resourceType, resourceIds: normalizedIds })
    },
    '_id parentId avatar type name intro tmbId updateTime inheritPermission modules'
  ).sort({ updateTime: -1 });
  if (session) query.session(session);

  const idSet = new Set(normalizedIds);
  const refsKey = resourceRefKeyMap[resourceType];
  const apps = await query.lean();

  return apps.filter((app) =>
    extractCurrentAppResourceRefsFromNodes(app.modules)[refsKey].some((id) => idSet.has(id))
  );
};

/** Build a resource-to-App-id map with one App counted at most once per resource. */
export const getCurrentResourceReferenceAppIds = async ({
  teamId,
  resourceType,
  resourceIds,
  excludeAppIds
}: {
  teamId: string;
  resourceType: AppCurrentResourceRefType;
  resourceIds: string[];
  excludeAppIds?: string[];
}) => {
  const result = new Map<string, Set<string>>();
  const idSet = new Set(resourceIds);
  const refsKey = resourceRefKeyMap[resourceType];
  const apps = await findAppsByCurrentResourceRefs({
    teamId,
    resourceType,
    resourceIds,
    excludeAppIds
  });

  apps.forEach((app) => {
    extractCurrentAppResourceRefsFromNodes(app.modules)[refsKey].forEach((resourceId) => {
      if (!idSet.has(resourceId)) return;
      const appIds = result.get(resourceId) ?? new Set<string>();
      appIds.add(String(app._id));
      result.set(resourceId, appIds);
    });
  });

  return result;
};

/** Count unique referencing Apps for leaf resources or folders represented by resource-id groups. */
export const getCurrentResourceReferenceCounts = async ({
  teamId,
  resourceType,
  resourceGroups,
  excludeAppIds
}: {
  teamId: string;
  resourceType: AppCurrentResourceRefType;
  resourceGroups: Map<string, string[]>;
  excludeAppIds?: string[];
}) => {
  const resourceIds = Array.from(new Set(Array.from(resourceGroups.values()).flat()));
  const appIdsByResource = await getCurrentResourceReferenceAppIds({
    teamId,
    resourceType,
    resourceIds,
    excludeAppIds
  });

  return new Map(
    Array.from(resourceGroups.entries()).map(([groupId, groupResourceIds]) => {
      const appIds = new Set<string>();
      groupResourceIds.forEach((resourceId) => {
        appIdsByResource.get(resourceId)?.forEach((appId) => appIds.add(appId));
      });
      return [groupId, appIds.size];
    })
  );
};
