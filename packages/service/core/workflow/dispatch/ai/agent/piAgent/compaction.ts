/**
 * Context compaction for piAgent.
 *
 * Adapts pi-mono's coding-agent compaction strategy to FastGPT's piAgent.
 * Uses the Agent's `transformContext` hook to detect large contexts and
 * replace old messages with an LLM-generated structured summary.
 *
 * Architecture is simplified from pi-mono:
 * - No session tree (flat message list)
 * - No extensions
 * - No branch summarization
 * - No turn splitting
 */

import type { AgentMessage, AgentState } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Model, Usage } from '@mariozechner/pi-ai';
import { completeSimple } from '@mariozechner/pi-ai';
import { getLogger, LogCategories } from '../../../../../../common/logger';

// ============================================================================
// Settings
// ============================================================================

export interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,
  keepRecentTokens: 20000
};

// ============================================================================
// Compaction State (closure — persisted across transformContext calls)
// ============================================================================

interface CompactionState {
  previousSummary?: string;
  readFiles: Set<string>;
  modifiedFiles: Set<string>;
  lastCompactionIndex: number;
}

function createCompactionState(): CompactionState {
  return {
    readFiles: new Set(),
    modifiedFiles: new Set(),
    lastCompactionIndex: -1
  };
}

// ============================================================================
// Token Estimation
// ============================================================================

function calculateContextTokens(usage: Usage): number {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function getAssistantUsage(msg: AgentMessage): Usage | undefined {
  if (msg.role === 'assistant' && 'usage' in msg) {
    const assistant = msg as AssistantMessage;
    if (assistant.stopReason !== 'aborted' && assistant.stopReason !== 'error' && assistant.usage) {
      return assistant.usage;
    }
  }
  return undefined;
}

/**
 * Estimate token count for a message using chars/4 heuristic (conservative overestimate).
 */
export function estimateTokens(message: AgentMessage): number {
  let chars = 0;

  switch (message.role) {
    case 'user': {
      const content = (message as { content: string | Array<{ type: string; text?: string }> })
        .content;
      if (typeof content === 'string') {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) chars += block.text.length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case 'assistant': {
      const assistant = message as AssistantMessage;
      for (const block of assistant.content) {
        if (block.type === 'text') chars += block.text.length;
        else if (block.type === 'thinking') chars += block.thinking.length;
        else if (block.type === 'toolCall') {
          chars += block.name.length + JSON.stringify(block.arguments).length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case 'toolResult': {
      const content = typeof message.content === 'string' ? message.content : '';
      chars = content.length;
      return Math.ceil(chars / 4);
    }
    default:
      return 0;
  }
}

/**
 * Estimate total context tokens from messages.
 * Uses last assistant usage for accuracy, falls back to chars/4 heuristic.
 */
export function estimateContextTokens(messages: AgentMessage[]): {
  tokens: number;
  lastUsageIndex: number | null;
} {
  // Find last non-error assistant message with usage
  let lastUsageIndex: number | null = null;
  let lastUsage: Usage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = getAssistantUsage(messages[i]);
    if (usage) {
      lastUsage = usage;
      lastUsageIndex = i;
      break;
    }
  }

  if (!lastUsage || lastUsageIndex === null) {
    let estimated = 0;
    for (const m of messages) estimated += estimateTokens(m);
    return { tokens: estimated, lastUsageIndex: null };
  }

  const usageTokens = calculateContextTokens(lastUsage);
  let trailingTokens = 0;
  for (let i = lastUsageIndex + 1; i < messages.length; i++) {
    trailingTokens += estimateTokens(messages[i]);
  }

  return { tokens: usageTokens + trailingTokens, lastUsageIndex };
}

// ============================================================================
// Threshold & Cut Point
// ============================================================================

export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings
): boolean {
  if (!settings.enabled) return false;
  return contextTokens > contextWindow - settings.reserveTokens;
}

/**
 * Find cut point: index of first message to keep.
 * Walks backwards accumulating token estimates until exceeding keepRecentTokens.
 * Cuts only at user or assistant message boundaries (never in the middle of a
 * tool-call → tool-result pair).
 */
function findCutPoint(messages: AgentMessage[], keepRecentTokens: number): number {
  // Valid cut points: indices of user, assistant, or compaction messages
  const validCutPoints: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i].role;
    if (role === 'user' || role === 'assistant') {
      validCutPoints.push(i);
    }
  }

  if (validCutPoints.length === 0) return 0;

  let accumulated = 0;
  let cutIndex = validCutPoints[0];

  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += estimateTokens(messages[i]);
    if (accumulated >= keepRecentTokens) {
      for (const cp of validCutPoints) {
        if (cp >= i) {
          cutIndex = cp;
          break;
        }
      }
      break;
    }
  }

  // When total tokens < keepRecentTokens, accumulated never hits the threshold.
  // Keep at least the first user message (current prompt); summarize the rest.
  if (accumulated < keepRecentTokens && validCutPoints.length >= 2) {
    // Use the second valid cut point so the first message (current prompt) is kept.
    // If we only have 2 cut points and the first is index 0, keep just message 0.
    cutIndex = validCutPoints[1];
  }

  // When cutting at an assistant message with tool calls, include its tool results
  if (messages[cutIndex].role === 'assistant') {
    let j = cutIndex + 1;
    while (j < messages.length && messages[j].role === 'toolResult') {
      j++;
    }
    return j;
  }

  return cutIndex;
}

// ============================================================================
// File Operation Tracking
// ============================================================================

interface FileOperations {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

function createFileOps(): FileOperations {
  return { read: new Set(), written: new Set(), edited: new Set() };
}

function extractFileOpsFromMessage(message: AgentMessage, fileOps: FileOperations): void {
  if (message.role !== 'assistant') return;
  const content = (message as unknown as Record<string, unknown>).content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    const b = block as Record<string, unknown>;
    if (b.type !== 'toolCall') continue;
    const args = b.arguments as Record<string, unknown> | undefined;
    if (!args) continue;
    const path = typeof args.path === 'string' ? args.path : undefined;
    if (!path) continue;

    switch (b.name) {
      case 'read':
        fileOps.read.add(path);
        break;
      case 'write':
        fileOps.written.add(path);
        break;
      case 'edit':
        fileOps.edited.add(path);
        break;
    }
  }
}

function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles: readOnly, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const parts: string[] = [];
  if (readFiles.length > 0) {
    parts.push(`<read-files>\n${readFiles.join('\n')}\n</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    parts.push(`<modified-files>\n${modifiedFiles.join('\n')}\n</modified-files>`);
  }
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
}

// ============================================================================
// Summarization
// ============================================================================

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const INITIAL_SUMMARY_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARY_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const TOOL_RESULT_MAX_CHARS = 2000;

function truncateForSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n[... ${truncated} more characters truncated]`;
}

function serializeConversation(messages: AgentMessage[], reserveTokens: number): string {
  // Max chars roughly reserveTokens * 4 (chars/4 heuristic)
  const maxChars = reserveTokens * 4 * 0.8;

  let charCount = 0;

  // Walk from newest to oldest for budget prioritization
  const serialized: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    let line = '';

    if (msg.role === 'user') {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                .map((c) => c.text)
                .join('')
            : '';
      if (content) line = `[User]: ${content}`;
    } else if (msg.role === 'assistant') {
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const toolCalls: string[] = [];

      for (const block of (msg as AssistantMessage).content) {
        if (block.type === 'text') textParts.push(block.text);
        else if (block.type === 'thinking') thinkingParts.push(block.thinking);
        else if (block.type === 'toolCall') {
          toolCalls.push(`${block.name}(${JSON.stringify(block.arguments)})`);
        }
      }

      if (thinkingParts.length > 0) {
        line += `[Assistant thinking]${thinkingParts.join('\n')}\n`;
      }
      if (textParts.length > 0) {
        line += `[Assistant]: ${textParts.join('\n')}\n`;
      }
      if (toolCalls.length > 0) {
        line += `[Assistant tool calls]: ${toolCalls.join('; ')}`;
      }
    } else if (msg.role === 'toolResult') {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');
      }
      if (content) {
        line = `[Tool result]: ${truncateForSummary(content, TOOL_RESULT_MAX_CHARS)}`;
      }
    }

    if (line) {
      charCount += line.length;
      if (charCount > maxChars) break;
      serialized.unshift(line);
    }
  }

  return serialized.join('\n\n');
}

async function generateSummary(
  messagesToSummarize: AgentMessage[],
  model: Model<any>,
  apiKey: string,
  reserveTokens: number,
  previousSummary?: string,
  signal?: AbortSignal
): Promise<string> {
  const maxTokens = Math.floor(0.8 * reserveTokens);

  // Serialize conversation to text so the model doesn't try to continue it
  const conversationText = serializeConversation(messagesToSummarize, reserveTokens);

  const promptType = previousSummary ? UPDATE_SUMMARY_PROMPT : INITIAL_SUMMARY_PROMPT;
  let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
  if (previousSummary) {
    promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  }
  promptText += promptType;

  const summarizationMessages = [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: promptText }],
      timestamp: Date.now()
    }
  ];

  const response = await completeSimple(
    model,
    {
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: summarizationMessages
    },
    { maxTokens, signal, apiKey }
  );

  if (response.stopReason === 'error') {
    throw new Error(`Summarization failed: ${response.errorMessage || 'Unknown error'}`);
  }

  return response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

// ============================================================================
// Compaction Summary Message
// ============================================================================

const COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;

const COMPACTION_SUMMARY_SUFFIX = `
</summary>`;

// ============================================================================
// Main transformContext Factory
// ============================================================================

export interface CreateCompactionTransformOptions {
  model: Model<any>;
  apiKey: string;
  settings?: Partial<CompactionSettings>;
  /** Reference to agent state for side-effect updates */
  getAgentState: () => AgentState;
}

/**
 * Create a `transformContext` function for pi-agent-core's Agent constructor.
 *
 * The returned function:
 * 1. Estimates context tokens from current messages
 * 2. If over threshold, summarizes old messages via LLM
 * 3. Replaces old messages with a compaction summary message
 * 4. Returns the compacted message list for the current LLM call
 * 5. Updates agent.state.messages as a side effect (for persistence)
 */
export function createCompactionTransform(
  opts: CreateCompactionTransformOptions
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  const { model, apiKey, getAgentState } = opts;
  const settings: CompactionSettings = {
    ...DEFAULT_COMPACTION_SETTINGS,
    ...opts.settings
  };
  const state = createCompactionState();

  return async function compactionTransform(
    messages: AgentMessage[],
    signal?: AbortSignal
  ): Promise<AgentMessage[]> {
    if (!settings.enabled) return messages;
    if (messages.length < 4) return messages; // Too small to compact

    const contextWindow = model.contextWindow || 128000;

    // Check if compaction is needed
    const { tokens } = estimateContextTokens(messages);
    if (!shouldCompact(tokens, contextWindow, settings)) {
      return messages;
    }

    // Only compact messages that haven't been compacted yet
    const startIndex = state.lastCompactionIndex >= 0 ? state.lastCompactionIndex : 0;
    const newMessages = messages.slice(startIndex);
    const oldMessages = messages.slice(0, startIndex);

    // Find cut point
    const cutIndex = findCutPoint(newMessages, settings.keepRecentTokens);
    const messagesToSummarize = newMessages.slice(0, cutIndex);
    const messagesToKeep = newMessages.slice(cutIndex);

    // Nothing to summarize
    if (messagesToSummarize.length === 0) return messages;

    // Extract file ops from messages being summarized
    const fileOps = createFileOps();
    for (const msg of messagesToSummarize) {
      extractFileOpsFromMessage(msg, fileOps);
    }
    // Merge with previous compaction's file tracking
    for (const f of state.readFiles) fileOps.read.add(f);
    for (const f of state.modifiedFiles) {
      fileOps.edited.add(f);
    }

    // Generate summary
    const summaryTokens = messagesToSummarize.reduce((sum, m) => sum + estimateTokens(m), 0);
    const logger = getLogger(LogCategories.MODULE.AI.AGENT);
    logger.debug(
      `[piAgent] Compacting: summarizing ${messagesToSummarize.length} messages (~${summaryTokens} estimated tokens)`
    );

    const summary = await generateSummary(
      messagesToSummarize,
      model,
      apiKey,
      settings.reserveTokens,
      state.previousSummary,
      signal
    );

    // Update compaction state
    state.previousSummary = summary;
    const { readFiles, modifiedFiles } = computeFileLists(fileOps);
    state.readFiles = new Set(readFiles);
    state.modifiedFiles = new Set(modifiedFiles);

    // Build compaction summary message (append file lists)
    const summaryWithFiles = summary + formatFileOperations(readFiles, modifiedFiles);
    const summaryText = COMPACTION_SUMMARY_PREFIX + summaryWithFiles + COMPACTION_SUMMARY_SUFFIX;
    const compactionMsg: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text: summaryText }],
      timestamp: Date.now()
    };

    // Build compacted list: [...oldCompactedMsgs, compactionMsg, ...recentMessages]
    const compacted = [...oldMessages, compactionMsg, ...messagesToKeep];
    state.lastCompactionIndex = compacted.length - messagesToKeep.length;

    // Side-effect: update agent state so compaction persists
    try {
      const agentState = getAgentState();
      agentState.messages = compacted;
    } catch {
      // getAgentState might fail if agent is not available; non-fatal
    }

    logger.debug(
      `[piAgent] Compaction complete: ${messages.length} → ${compacted.length} messages`
    );

    return compacted;
  };
}
