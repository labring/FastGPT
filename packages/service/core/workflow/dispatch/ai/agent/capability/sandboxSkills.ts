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
} from '@fastgpt/global/core/workflow/node/agent/skillTools';
import {
  SANDBOX_GET_FILE_URL_TOOL,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SandboxGetFileUrlToolSchema
} from '@fastgpt/global/core/ai/sandbox/constants';
import { createAgentSandbox, releaseAgentSandbox } from '../sub/sandbox';
import { buildSkillsContextPrompt } from '../sub/sandbox/prompt';
import { parseJsonArgs } from '../../../../../ai/utils';
import {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch,
  dispatchSandboxFetchUserFile
} from '../sub/sandbox/skill';
import { uploadSandboxFileToS3 } from '../../../../../ai/sandbox/toolCall';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '../../../type';
import type {
  AIChatItemValueItemType,
  SandboxStatusItemType
} from '@fastgpt/global/core/chat/type';
import type { AgentSandboxContext, DeployedSkillInfo } from '../sub/sandbox/types';
import { MongoAgentSkills } from '../../../../../agentSkills/schema';
import { MongoSandboxInstance } from '../../../../../ai/sandbox/schema';
import { getSandboxDefaults } from '../../../../../agentSkills/sandboxConfig';
import { downloadSkillPackage } from '../../../../../agentSkills/storage';
import { extractSkillMdInfoFromBuffer } from '../../../../../agentSkills/archiveUtils';
import { parseSkillMarkdown } from '../../../../../agentSkills/utils';

type SandboxToolResult = {
  response: string;
  usages: any[];
  assistantResponses?: AIChatItemValueItemType[];
  /** Skill names detected when reading SKILL.md files */
  skillNames?: string[];
};

type SandboxSkillsCapabilityParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string;
  workflowStreamResponse?: WorkflowResponseType; // SSE stream for lifecycle and skill events
  showSkillReferences: boolean;
  allFilesMap: Record<string, { url: string; name: string; type: string }>;
  // When true (chat-mode pi agent), expose `sandbox_get_file_url` so the model can
  // hand sandbox files back to the user as previewable/downloadable links.
  // Requires `appId`/`userId`/`chatId` to be set for S3 object keying.
  exposeGetFileUrl?: boolean;
  appId?: string;
  userId?: string;
  chatId?: string;
};

/** Fetch skill metadata from MongoDB and compute sandbox paths from the ZIP for prompt construction. */
async function fetchSkillsMetaForPrompt(
  skillIds: string[],
  teamId: string,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  const skills = await MongoAgentSkills.find(
    { _id: { $in: skillIds }, teamId, deleteTime: null },
    { name: 1, description: 1, avatar: 1, currentStorage: 1 }
  ).lean();

  const results = await Promise.allSettled(
    skills.map(async (skill) => {
      const fallback: DeployedSkillInfo = {
        id: String(skill._id),
        name: skill.name,
        description: skill.description ?? '',
        avatar: skill.avatar,
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
          id: fallback.id,
          name: frontmatter.name ? String(frontmatter.name) : fallback.name,
          description: frontmatter.description
            ? String(frontmatter.description)
            : fallback.description,
          avatar: fallback.avatar,
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
          id: String(skills[i]._id),
          name: skills[i].name,
          description: skills[i].description ?? '',
          avatar: skills[i].avatar,
          skillMdPath: '',
          directory: ''
        }
  );
}

/** Check whether an error indicates a sandbox that no longer exists or is unreachable. */
export function isSandboxExpiredError(err: unknown): boolean {
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

export function collectSkillReferenceResponses({
  paths,
  sandboxContext,
  workflowStreamResponse,
  showSkillReferences,
  toolCallId
}: {
  paths: string[];
  sandboxContext: AgentSandboxContext;
  workflowStreamResponse?: WorkflowResponseType;
  showSkillReferences: boolean;
  toolCallId: string;
}): AIChatItemValueItemType[] {
  if (!showSkillReferences) return [];

  const skillResponses: AIChatItemValueItemType[] = [];
  for (const filePath of paths) {
    if (!filePath.endsWith('/SKILL.md')) continue;

    const skill = sandboxContext.deployedSkills.find(
      (s) => s.skillMdPath === filePath || filePath.startsWith(s.directory + '/')
    );
    if (!skill) continue;

    // Use toolCallId from the triggering tool call for correlation
    workflowStreamResponse?.({
      id: toolCallId,
      event: SseResponseEventEnum.skillCall,
      data: {
        skill: {
          id: toolCallId,
          skillName: skill.name,
          skillAvatar: skill.avatar || '',
          description: skill.description,
          skillMdPath: filePath
        }
      }
    });

    skillResponses.push({
      skills: [
        {
          id: toolCallId,
          skillName: skill.name,
          skillAvatar: skill.avatar || '',
          description: skill.description,
          skillMdPath: filePath
        }
      ]
    });
  }
  return skillResponses;
}

export async function createSandboxSkillsCapability(
  params: SandboxSkillsCapabilityParams
): Promise<AgentCapability> {
  const {
    skillIds,
    teamId,
    tmbId,
    sessionId,
    workflowStreamResponse,
    showSkillReferences,
    allFilesMap,
    exposeGetFileUrl,
    appId,
    userId,
    chatId
  } = params;
  // Only chat-mode can serve sandbox_get_file_url because the file
  // upload S3 key requires appId/userId/chatId.
  const canExposeGetFileUrl = !!exposeGetFileUrl && !!appId && !!userId && !!chatId;
  const sessionCompletionTools = canExposeGetFileUrl
    ? [...allSandboxTools, SANDBOX_GET_FILE_URL_TOOL]
    : allSandboxTools;
  const defaults = getSandboxDefaults();
  const logger = getLogger(LogCategories.MODULE.AI.AGENT);

  // Session-runtime: preload skill metadata with sandbox paths from ZIP (no container creation)
  const skillsMeta =
    skillIds.length > 0
      ? await fetchSkillsMetaForPrompt(skillIds, teamId, defaults.workDirectory)
      : [];

  const systemPrompt = canExposeGetFileUrl
    ? `${buildSkillsContextPrompt(skillsMeta, defaults.workDirectory)}\n\n${buildGetFileUrlPromptSection()}`
    : buildSkillsContextPrompt(skillsMeta, defaults.workDirectory);

  // Build a path→name map so callers can pre-resolve tool display names
  // before SSE emission when sandbox_read_file reads SKILL.md files.
  const skillPathMap: Record<string, string> = {};
  for (const s of skillsMeta) {
    if (s.skillMdPath) skillPathMap[s.skillMdPath] = s.name;
    if (s.directory) skillPathMap[s.directory + '/'] = s.name;
  }

  // --- Lazy-init state ---
  let sandboxContext: AgentSandboxContext | null = null;
  let initPromise: Promise<AgentSandboxContext> | null = null;

  const onProgress = workflowStreamResponse
    ? (status: SandboxStatusItemType) =>
        workflowStreamResponse({ event: SseResponseEventEnum.sandboxStatus, data: status })
    : undefined;

  async function initializeSandbox(): Promise<AgentSandboxContext> {
    onProgress?.({ sandboxId: sessionId, phase: 'lazyInit' });
    return createAgentSandbox({
      skillIds,
      teamId,
      tmbId,
      sessionId,
      chatId: chatId ?? sessionId,
      onProgress,
      skillsMeta
    });
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
    executor: (ctx: AgentSandboxContext) => Promise<SandboxToolResult>
  ): Promise<SandboxToolResult> {
    let ctx: AgentSandboxContext;
    try {
      ctx = await ensureSandbox();
    } catch (err) {
      return {
        response: `Sandbox initialization failed: ${(err as Error).message}`,
        usages: []
      };
    }

    let result: SandboxToolResult;
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
    completionTools: sessionCompletionTools,
    handleToolCall: async (toolId, args, toolCallId) => {
      if (canExposeGetFileUrl && toolId === SANDBOX_GET_FILE_URL_TOOL_NAME) {
        return executeWithRetry((ctx) =>
          dispatchSandboxGetFileUrl(ctx, args, {
            appId: appId!,
            userId: userId!,
            chatId: chatId!
          })
        );
      }
      if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) return null;

      return executeWithRetry(async (ctx) => {
        return buildSessionHandler(
          toolId,
          args,
          ctx,
          allFilesMap,
          workflowStreamResponse,
          showSkillReferences,
          toolCallId
        );
      });
    },
    dispose: async () => {
      if (sandboxContext) {
        releaseAgentSandbox(sandboxContext).catch((err) => {
          logger.error('[Agent Sandbox] Release failed', { error: err });
        });
      }
    },
    skillPathMap
  };
}

// --- Handler builders ---

async function buildSessionHandler(
  toolId: string,
  args: string,
  sandboxContext: AgentSandboxContext,
  allFilesMap: Record<string, { url: string; name: string; type: string }>,
  workflowStreamResponse?: WorkflowResponseType,
  showSkillReferences = false,
  toolCallId = ''
): Promise<SandboxToolResult> {
  const handlers: Record<string, () => Promise<SandboxToolResult>> = {
    [SandboxToolIds.readFile]: async () => {
      const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      const assistantResponses = collectSkillReferenceResponses({
        paths: parsed.data.paths,
        sandboxContext,
        workflowStreamResponse,
        showSkillReferences,
        toolCallId
      });

      const skillNames = assistantResponses
        .flatMap((r) => r.skills?.map((s) => s.skillName) ?? [])
        .filter(Boolean);

      return {
        ...(await dispatchSandboxReadFile(sandboxContext, parsed.data)),
        ...(assistantResponses.length > 0 && { assistantResponses }),
        ...(skillNames.length > 0 && { skillNames })
      };
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

async function dispatchSandboxGetFileUrl(
  sandboxContext: AgentSandboxContext,
  args: string,
  ownership: { appId: string; userId: string; chatId: string }
): Promise<SandboxToolResult> {
  const parsed = SandboxGetFileUrlToolSchema.safeParse(parseJsonArgs(args));
  if (!parsed.success) return { response: parsed.error.message, usages: [] };

  try {
    const result = await Promise.all(
      parsed.data.paths.map((filePath) =>
        uploadSandboxFileToS3({
          sandboxProvider: sandboxContext.sandbox,
          appId: ownership.appId,
          userId: ownership.userId,
          chatId: ownership.chatId,
          filePath
        })
      )
    );
    return { response: JSON.stringify(result), usages: [] };
  } catch (err) {
    return { response: `sandbox_get_file_url failed: ${(err as Error).message}`, usages: [] };
  }
}

function buildGetFileUrlPromptSection(): string {
  return [
    '<file_delivery>',
    'Files produced inside the sandbox stay invisible to the user until you publish them with `sandbox_get_file_url`.',
    'WHEN to call it:',
    '  - After `sandbox_write_file` creates a deliverable for the user (report, CSV, JSON, markdown, code bundle, etc.).',
    '  - After `sandbox_execute` produces a new file or modifies one the user should see (charts, PDFs, archives, generated assets, downloadable logs).',
    '  - When the user asks for a file, a screenshot, a chart, an export, a download, or a "可下载/可预览" artifact.',
    'WHEN NOT to call it:',
    '  - For ephemeral scratch files, intermediate caches, or files used only by the next tool call.',
    '  - For raw text answers that fit comfortably in chat — answer inline instead.',
    'HOW to call it:',
    '  - Pass relative sandbox paths in the same form you used to write them (e.g. `["output/report.pdf", "charts/loss.png"]`).',
    '  - Batch multiple files into one call when they belong to the same deliverable.',
    '  - Call it AFTER the file is fully written/closed by the producing tool.',
    'AFTER the call:',
    '  - The tool returns `[{ fileUrl, filename }, ...]`. The frontend automatically renders these as preview / download cards; you do NOT need to paste raw URLs in your reply.',
    '  - Briefly mention the file by name (and what it contains) in natural language so the user knows what to look for.',
    'IMPORTANT:',
    '  - URLs are signed and expire after 1 day; regenerate them if the user comes back later.',
    '  - Never expose internal sandbox absolute paths to the user — only filenames.',
    '</file_delivery>'
  ].join('\n');
}
