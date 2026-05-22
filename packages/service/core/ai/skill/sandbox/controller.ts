import type { SandboxInstanceSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { getSandboxProviderConfig } from '../../sandbox/provider/config';
import {
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam,
  findSkillRelatedSandboxResources
} from '../../sandbox/instance/repository';
import { deleteSandboxResource } from '../../sandbox/service/resource';
import { getLogger, LogCategories } from '../../../../common/logger';

export {
  createEditDebugSandbox,
  packageSkillInSandbox,
  type CreateEditDebugSandboxParams,
  type CreateEditDebugSandboxResult
} from '../edit/sandbox';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const { sandboxId, teamId } = params;

  const providerConfig = getSandboxProviderConfig();
  const sandbox = await findSandboxInstanceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  return sandbox as unknown as SandboxInstanceSchemaType;
}

/**
 * Delete sandbox
 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const { sandboxId, teamId } = params;

  const providerConfig = getSandboxProviderConfig();
  const instanceDoc = await findSandboxResourceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!instanceDoc) {
    throw new Error('Sandbox not found or access denied');
  }

  addLog.info('[Sandbox] Deleting sandbox', { sandboxId });

  await deleteSandboxResource(instanceDoc);
}

/**
 * Force delete all sandbox instances related to the given skill IDs
 * Called when a skill is deleted to clean up provider resources
 */
export async function deleteSkillRelatedSandboxes(skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;

  const instances = await findSkillRelatedSandboxResources(skillIds);

  if (instances.length === 0) return;

  addLog.info('[Sandbox] Force deleting skill-related sandboxes', {
    skillIds,
    count: instances.length
  });

  await Promise.allSettled(
    instances.map(async (doc) => {
      await deleteSandboxResource(doc);
    })
  );
}
