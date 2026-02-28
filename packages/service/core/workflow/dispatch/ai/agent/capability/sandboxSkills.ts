import type { AgentCapability } from './type';
import {
  allSandboxTools,
  SandboxToolIds,
  SandboxReadFileSchema,
  SandboxWriteFileSchema,
  SandboxEditFileSchema,
  SandboxExecuteSchema,
  SandboxSearchSchema
} from '@fastgpt/global/core/workflow/node/agent/sandboxTools';
import {
  createAgentSandbox,
  releaseAgentSandbox,
  connectEditDebugSandbox,
  disconnectEditDebugSandbox,
  buildSkillsContextPrompt
} from '../sub/sandbox';
import { parseJsonArgs } from '../../../../../ai/utils';
import {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch
} from '../sub/sandbox/dispatch';
import { getLogger, LogCategories } from '../../../../../../common/logger';

type SandboxSkillsCapabilityParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string;
  mode: 'sessionRuntime' | 'editDebug';
};

export async function createSandboxSkillsCapability(
  params: SandboxSkillsCapabilityParams
): Promise<AgentCapability> {
  const { skillIds, teamId, tmbId, sessionId, mode } = params;
  const isEditDebug = mode === 'editDebug';

  let sandboxContext;

  if (isEditDebug) {
    if (skillIds.length !== 1) {
      throw new Error('useEditDebugSandbox only supports a single skill');
    }
    sandboxContext = await connectEditDebugSandbox({
      skillId: skillIds[0],
      teamId
    });
  } else {
    sandboxContext = await createAgentSandbox({
      skillIds,
      teamId,
      tmbId,
      sessionId
    });
  }

  const systemPrompt = buildSkillsContextPrompt(
    sandboxContext.skills,
    sandboxContext.workDirectory
  );

  return {
    id: 'sandbox-skills',
    systemPrompt,
    completionTools: allSandboxTools,
    handleToolCall: async (toolId, args) => {
      if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) {
        return null;
      }

      const handlers: Record<string, () => Promise<{ response: string; usages: [] }>> = {
        [SandboxToolIds.readFile]: async () => {
          const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
          if (!parsed.success) return { response: parsed.error.message, usages: [] };
          return dispatchSandboxReadFile(sandboxContext, parsed.data);
        },
        [SandboxToolIds.writeFile]: async () => {
          const parsed = SandboxWriteFileSchema.safeParse(parseJsonArgs(args));
          if (!parsed.success) return { response: parsed.error.message, usages: [] };
          return dispatchSandboxWriteFile(sandboxContext, parsed.data);
        },
        [SandboxToolIds.editFile]: async () => {
          const parsed = SandboxEditFileSchema.safeParse(parseJsonArgs(args));
          if (!parsed.success) return { response: parsed.error.message, usages: [] };
          return dispatchSandboxEditFile(sandboxContext, parsed.data);
        },
        [SandboxToolIds.execute]: async () => {
          const parsed = SandboxExecuteSchema.safeParse(parseJsonArgs(args));
          if (!parsed.success) return { response: parsed.error.message, usages: [] };
          return dispatchSandboxExecute(sandboxContext, parsed.data);
        },
        [SandboxToolIds.search]: async () => {
          const parsed = SandboxSearchSchema.safeParse(parseJsonArgs(args));
          if (!parsed.success) return { response: parsed.error.message, usages: [] };
          return dispatchSandboxSearch(sandboxContext, parsed.data);
        }
      };

      const handler = handlers[toolId];
      if (!handler) return null;
      return handler();
    },
    dispose: async () => {
      if (isEditDebug) {
        disconnectEditDebugSandbox(sandboxContext).catch((err) => {
          getLogger(LogCategories.MODULE.AI.AGENT).error('[Agent Sandbox] Disconnect failed', {
            error: err
          });
        });
      } else {
        releaseAgentSandbox(sandboxContext).catch((err) => {
          getLogger(LogCategories.MODULE.AI.AGENT).error('[Agent Sandbox] Release failed', {
            error: err
          });
        });
      }
    }
  };
}
