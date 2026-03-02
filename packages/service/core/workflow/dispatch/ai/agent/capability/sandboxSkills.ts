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
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '../../../type';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

type SandboxSkillsCapabilityParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string;
  mode: 'sessionRuntime' | 'editDebug';
  workflowStreamResponse?: WorkflowResponseType; // SSE stream for lifecycle and skill events
};

export async function createSandboxSkillsCapability(
  params: SandboxSkillsCapabilityParams
): Promise<AgentCapability> {
  const { skillIds, teamId, tmbId, sessionId, mode, workflowStreamResponse } = params;
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
    // Build onProgress callback for session-runtime sandbox lifecycle events
    const onProgress = workflowStreamResponse
      ? (status: SandboxStatusItemType) =>
          workflowStreamResponse({ event: SseResponseEventEnum.sandboxStatus, data: status })
      : undefined;

    sandboxContext = await createAgentSandbox({
      skillIds,
      teamId,
      tmbId,
      sessionId,
      onProgress
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

          // Detect SKILL.md reads and emit skillCall event
          if (workflowStreamResponse) {
            for (const path of parsed.data.paths) {
              if (path.endsWith('/SKILL.md')) {
                const segments = path.split('/');
                const skillName = segments[segments.length - 2];
                const skill = sandboxContext.skills.find((s) => s.name === skillName);
                if (skill) {
                  workflowStreamResponse({
                    event: SseResponseEventEnum.skillCall,
                    data: {
                      skill: {
                        name: skill.name,
                        description: skill.description,
                        avatar: skill.avatar || '',
                        skillMdPath: path
                      }
                    }
                  });
                }
              }
            }
          }

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
