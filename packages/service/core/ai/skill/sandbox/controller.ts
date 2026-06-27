import type { SandboxInstanceSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { getSandboxProviderConfig } from '../../sandbox/provider/config';
import {
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam
} from '../../sandbox/instance/repository';
import { deleteSandboxResource } from '../../sandbox/service/resource';
import { getLogger, LogCategories } from '../../../../common/logger';

export {
  initSkillEditRuntimeSandbox,
  packageSkillInSandbox,
  type InitSkillEditRuntimeSandboxParams,
  type SkillEditRuntimeContext
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
