import path from 'path';
import type { AgentCapability } from './type';
import {
  allSandboxTools,
  SandboxToolIds,
  SandboxReadFileSchema,
  SandboxWriteFileSchema,
  SandboxEditFileSchema,
  SandboxExecuteSchema,
  SandboxSearchSchema,
  SandboxFetchUserFileSchema
} from '@fastgpt/global/core/workflow/node/agent/sandboxTools';
import {
  createAgentSandbox,
  releaseAgentSandbox,
  connectEditDebugSandbox,
  disconnectEditDebugSandbox
} from '../sub/sandbox';
import { buildSkillsContextPrompt } from '../sub/sandbox/prompt';
import { parseJsonArgs } from '../../../../../ai/utils';
import {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch,
  dispatchSandboxFetchUserFile
} from '../sub/sandbox/dispatch';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '../../../type';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import type { AgentSandboxContext, DeployedSkillInfo } from '../sub/sandbox/types';
import { MongoAgentSkills } from '../../../../../agentSkills/schema';
import { MongoSandboxInstance } from '../../../../../agentSkills/sandboxSchema';
import { getSandboxDefaults } from '../../../../../agentSkills/sandboxConfig';
import { downloadSkillPackage } from '../../../../../agentSkills/storage';
import { extractSkillMdInfoFromBuffer } from '../../../../../agentSkills/archiveUtils';
import { parseSkillMarkdown } from '../../../../../agentSkills/utils';

type SandboxSkillsCapabilityParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string;
  mode: 'sessionRuntime' | 'editDebug';
  workflowStreamResponse?: WorkflowResponseType; // SSE stream for lifecycle and skill events
  allFilesMap: Record<string, { url: string; name: string; type: string }>;
};

/** Fetch skill metadata from MongoDB and compute sandbox paths from the ZIP for prompt construction. */
async function fetchSkillsMetaForPrompt(
  skillIds: string[],
  teamId: string,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  const skills = await MongoAgentSkills.find(
    { _id: { $in: skillIds }, teamId, deleteTime: null },
    { name: 1, description: 1, currentStorage: 1 }
  ).lean();

  const results = await Promise.allSettled(
    skills.map(async (skill) => {
      const fallback: DeployedSkillInfo = {
        name: skill.name,
        description: skill.description ?? '',
        skillMdPath: '',
        directory: ''
      };

      if (!skill.currentStorage) return fallback;

      try {
        const buffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });
        const info = await extractSkillMdInfoFromBuffer(buffer);
        if (!info) return fallback;

        const { frontmatter } = parseSkillMarkdown(info.content);
        const skillMdPath = `${workDirectory}/${info.relativePath}`;
        return {
          name: frontmatter.name ? String(frontmatter.name) : fallback.name,
          description: frontmatter.description
            ? String(frontmatter.description)
            : fallback.description,
          skillMdPath,
          directory: path.dirname(skillMdPath)
        };
      } catch {
        return fallback;
      }
    })
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          name: skills[i].name,
          description: skills[i].description ?? '',
          skillMdPath: '',
          directory: ''
        }
  );
}

/** Check whether an error indicates a sandbox that no longer exists or is unreachable. */
function isSandboxExpiredError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('not found') ||
      msg.includes('not exist') ||
      msg.includes('connection') ||
      msg.includes('sandbox_not_found') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset')
    );
  }
  return false;
}

export async function createSandboxSkillsCapability(
  params: SandboxSkillsCapabilityParams
): Promise<AgentCapability> {
  const { skillIds, teamId, tmbId, sessionId, mode, workflowStreamResponse, allFilesMap } = params;
  const isEditDebug = mode === 'editDebug';
  const defaults = getSandboxDefaults();
  const logger = getLogger(LogCategories.MODULE.AI.AGENT);

  // editDebug: keep existing immediate-connect behavior
  if (isEditDebug) {
    if (skillIds.length !== 1) {
      throw new Error('useEditDebugSandbox only supports a single skill');
    }
    const sandboxContext = await connectEditDebugSandbox({
      skillId: skillIds[0],
      teamId
    });

    const systemPrompt = buildSkillsContextPrompt(
      sandboxContext.deployedSkills,
      sandboxContext.workDirectory
    );

    return {
      id: 'sandbox-skills',
      systemPrompt,
      completionTools: allSandboxTools,
      handleToolCall: async (toolId, args) => {
        if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) return null;
        const result = await buildEditDebugHandler(
          toolId,
          args,
          sandboxContext,
          allFilesMap,
          workflowStreamResponse
        );
        if (result !== null) {
          // Fire-and-forget: renew sandbox expiration after successful execution
          MongoSandboxInstance.updateOne(
            { sandboxId: sandboxContext.providerSandboxId },
            { lastActiveAt: new Date() }
          ).catch((err) =>
            logger.error('[Agent Sandbox] Failed to renew lastActiveAt', { error: err })
          );
        }
        return result;
      },
      dispose: async () => {
        disconnectEditDebugSandbox(sandboxContext).catch((err) => {
          logger.error('[Agent Sandbox] Disconnect failed', { error: err });
        });
      }
    };
  }

  // Session-runtime: preload skill metadata with sandbox paths from ZIP (no container creation)
  const skillsMeta =
    skillIds.length > 0
      ? await fetchSkillsMetaForPrompt(skillIds, teamId, defaults.workDirectory)
      : [];

  const systemPrompt = buildSkillsContextPrompt(skillsMeta, defaults.workDirectory);

  // --- Lazy-init state ---
  let sandboxContext: AgentSandboxContext | null = null;
  let initPromise: Promise<AgentSandboxContext> | null = null;

  const onProgress = workflowStreamResponse
    ? (status: SandboxStatusItemType) =>
        workflowStreamResponse({ event: SseResponseEventEnum.sandboxStatus, data: status })
    : undefined;

  async function initializeSandbox(): Promise<AgentSandboxContext> {
    onProgress?.({ sandboxId: sessionId, phase: 'lazyInit' });
    return createAgentSandbox({ skillIds, teamId, tmbId, sessionId, onProgress });
  }

  async function ensureSandbox(): Promise<AgentSandboxContext> {
    if (sandboxContext) return sandboxContext;
    if (!initPromise) {
      initPromise = initializeSandbox()
        .then((ctx) => {
          sandboxContext = ctx;
          initPromise = null;
          return ctx;
        })
        .catch((err) => {
          initPromise = null;
          throw err;
        });
    }
    return initPromise;
  }

  async function executeWithRetry(
    executor: (ctx: AgentSandboxContext) => Promise<{ response: string; usages: [] }>
  ): Promise<{ response: string; usages: [] }> {
    let ctx: AgentSandboxContext;
    try {
      ctx = await ensureSandbox();
    } catch (err) {
      return {
        response: `Sandbox initialization failed: ${(err as Error).message}`,
        usages: []
      };
    }

    let result: { response: string; usages: [] };
    try {
      result = await executor(ctx);
    } catch (err) {
      if (!isSandboxExpiredError(err)) throw err;

      // Silent rebuild: clear state and retry once
      sandboxContext = null;
      try {
        ctx = await ensureSandbox();
        result = await executor(ctx);
      } catch (retryErr) {
        return {
          response: `Sandbox operation failed: ${(retryErr as Error).message}`,
          usages: []
        };
      }
    }

    // Fire-and-forget: renew sandbox expiration after successful execution
    MongoSandboxInstance.updateOne(
      { sandboxId: ctx.providerSandboxId },
      { lastActiveAt: new Date() }
    ).catch((err) => logger.error('[Agent Sandbox] Failed to renew lastActiveAt', { error: err }));

    return result;
  }

  return {
    id: 'sandbox-skills',
    systemPrompt,
    completionTools: allSandboxTools,
    handleToolCall: async (toolId, args) => {
      if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) return null;

      return executeWithRetry(async (ctx) => {
        return buildSessionHandler(toolId, args, ctx, allFilesMap, workflowStreamResponse);
      });
    },
    dispose: async () => {
      if (sandboxContext) {
        releaseAgentSandbox(sandboxContext).catch((err) => {
          logger.error('[Agent Sandbox] Release failed', { error: err });
        });
      }
    }
  };
}

// --- Handler builders ---

async function buildEditDebugHandler(
  toolId: string,
  args: string,
  sandboxContext: AgentSandboxContext,
  allFilesMap: Record<string, { url: string; name: string; type: string }>,
  workflowStreamResponse?: WorkflowResponseType
): Promise<{ response: string; usages: [] } | null> {
  const handlers: Record<string, () => Promise<{ response: string; usages: [] }>> = {
    [SandboxToolIds.readFile]: async () => {
      const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      // Detect SKILL.md reads and emit skillCall event
      if (workflowStreamResponse) {
        for (const path of parsed.data.paths) {
          if (path.endsWith('/SKILL.md')) {
            const skill = sandboxContext.deployedSkills.find(
              (s) => s.skillMdPath === path || path.startsWith(s.directory + '/')
            );
            if (skill) {
              workflowStreamResponse({
                event: SseResponseEventEnum.skillCall,
                data: {
                  skill: {
                    name: skill.name,
                    description: skill.description,
                    avatar: '',
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
    },
    [SandboxToolIds.fetchUserFile]: async () => {
      const parsed = SandboxFetchUserFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxFetchUserFile(sandboxContext, parsed.data, allFilesMap);
    }
  };

  const handler = handlers[toolId];
  if (!handler) return null;
  return handler();
}

async function buildSessionHandler(
  toolId: string,
  args: string,
  sandboxContext: AgentSandboxContext,
  allFilesMap: Record<string, { url: string; name: string; type: string }>,
  workflowStreamResponse?: WorkflowResponseType
): Promise<{ response: string; usages: [] }> {
  const handlers: Record<string, () => Promise<{ response: string; usages: [] }>> = {
    [SandboxToolIds.readFile]: async () => {
      const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      // Detect SKILL.md reads and emit skillCall event
      if (workflowStreamResponse) {
        for (const path of parsed.data.paths) {
          if (path.endsWith('/SKILL.md')) {
            const skill = sandboxContext.deployedSkills.find(
              (s) => s.skillMdPath === path || path.startsWith(s.directory + '/')
            );
            if (skill) {
              workflowStreamResponse({
                event: SseResponseEventEnum.skillCall,
                data: {
                  skill: {
                    name: skill.name,
                    description: skill.description,
                    avatar: '',
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
    },
    [SandboxToolIds.fetchUserFile]: async () => {
      const parsed = SandboxFetchUserFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxFetchUserFile(sandboxContext, parsed.data, allFilesMap);
    }
  };

  const handler = handlers[toolId];
  if (!handler) return { response: 'Unknown sandbox tool', usages: [] };
  return handler();
}
