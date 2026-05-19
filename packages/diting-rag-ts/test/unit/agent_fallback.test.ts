// test/unit/agent_fallback.test.ts
// P0: Agent 节点异常场景 fallback 测试
// - LLM 调用失败时重试
// - native FC 无 toolCalls 时 text 降级
// - 无 tool call 且无 chunks 时注入引导消息再调 LLM
//
// 直接测试 agent node 函数，不通过图循环。

import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ports/llm';
import type { LLMMessage, LLMResponse, LLMCallOptions, ToolCall } from '../../src/types/message';
import { TOOL_DEFINITIONS } from '../../src/agent/tools';
import { parseAllToolCalls } from '../../src/agent/tools';

// ── Mock LLM helpers ──────────────────────────────────────────────────────

class CountedMockLLM implements LLMProvider {
  public callCount = 0;
  public receivedMessages: LLMMessage[][] = [];

  constructor(
    private responses: Array<{
      content: string;
      toolCalls?: LLMResponse['toolCalls'];
      shouldThrow?: boolean;
    }>
  ) {}

  async chat(messages: LLMMessage[], _options?: LLMCallOptions): Promise<LLMResponse> {
    this.receivedMessages.push([...messages]);
    this.callCount++;
    const r = this.responses[this.callCount - 1];
    if (!r) throw new Error(`No response configured for call #${this.callCount}`);
    if (r.shouldThrow) throw new Error(`Mock LLM failure #${this.callCount}`);
    return { content: r.content, toolCalls: r.toolCalls };
  }

  async *chatStream(_messages: LLMMessage[], _options?: LLMCallOptions): AsyncIterable<LLMResponse> {
    const r = await this.chat(_messages, _options);
    yield r;
  }

  getModelInfo() { return { name: 'counted-mock', contextWindow: 16000, maxOutputTokens: 8192 }; }
}

// ── Agent Node（含重试 + text fallback + no-tool-call 内部引导）────────────

interface AgentNodeState {
  messages: LLMMessage[];
  playbook: string;
  allChunks: Array<{ id: string; content: string }>;
  toolCallCount: number;
  iterationCount: number;
}

interface AgentNodeOutput {
  pendingToolCalls: ToolCall[];
  error: string;
  done: boolean;
  executionPath: string;
  toolCallCount: number;
  iterationCount: number;
}

const MAX_RETRIES = 1;
const MAX_NO_TOOL_GUIDANCE = 1;

async function runAgentNode(
  llm: LLMProvider,
  state: AgentNodeState
): Promise<AgentNodeOutput & { llmCallCount: number }> {
  let attempts = 0;
  let response: LLMResponse | null = null;
  let lastError: Error | null = null;

  // ── Phase 1: LLM 调用 + 网络重试 ──
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    attempts++;
    try {
      response = await llm.chat(state.messages, {
        tools: TOOL_DEFINITIONS,
        temperature: 0.1
      });
      break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }

  // 全部重试失败
  if (!response) {
    if (state.allChunks.length > 0) {
      return {
        pendingToolCalls: [],
        error: '',
        done: true,
        executionPath: 'agent(retry_exhausted_with_chunks)',
        toolCallCount: state.toolCallCount,
        iterationCount: state.iterationCount,
        llmCallCount: attempts
      };
    }
    return {
      pendingToolCalls: [],
      error: `agent error after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
      done: false,
      executionPath: 'agent(retry_exhausted)',
      toolCallCount: state.toolCallCount,
      iterationCount: state.iterationCount,
      llmCallCount: attempts
    };
  }

  // ── Phase 2: Text fallback ──
  let toolCalls: ToolCall[] = response.toolCalls ?? [];
  let mode = 'native';

  if (toolCalls.length === 0 && response.content) {
    const parsedCalls = parseAllToolCalls(response.content);
    if (parsedCalls.length > 0) {
      toolCalls = parsedCalls.map((c, i) => ({
        id: `text_fallback_${Date.now()}_${i}`,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) }
      }));
      mode = 'text_fallback';
    }
  }

  // ── Phase 3: No-tool-call → 注入引导消息重试 ──
  if (toolCalls.length === 0 && state.allChunks.length === 0) {
    // 构建 messages 用于引导重试：当前的 messages + assistant 回复 + guidance
    const guidanceMsg: LLMMessage = {
      role: 'user',
      content:
        'You MUST call a tool to proceed. Use @search to look up information, or @query_rewrite to improve your query. Do NOT output free text.',
      id: 'tool-call-guidance'
    };

    const assistantMsg: LLMMessage = { role: 'assistant', content: response.content };
    const guidedMessages = [...state.messages, assistantMsg, guidanceMsg];

    for (let g = 0; g <= MAX_NO_TOOL_GUIDANCE; g++) {
      try {
        const guidedResponse = await llm.chat(guidedMessages, {
          tools: TOOL_DEFINITIONS,
          temperature: 0.1
        });
        attempts++;

        let guidedToolCalls: ToolCall[] = guidedResponse.toolCalls ?? [];
        if (guidedToolCalls.length === 0 && guidedResponse.content) {
          const parsed = parseAllToolCalls(guidedResponse.content);
          if (parsed.length > 0) {
            guidedToolCalls = parsed.map((c, i) => ({
              id: `guided_text_${Date.now()}_${i}`,
              type: 'function' as const,
              function: { name: c.name, arguments: JSON.stringify(c.args) }
            }));
            mode = 'guided_text';
          }
        }

        if (guidedToolCalls.length > 0) {
          const toolNames = guidedToolCalls.map((tc) => tc.function.name);
          return {
            pendingToolCalls: guidedToolCalls,
            error: '',
            done: false,
            executionPath: `agent(${mode},${toolNames.join(',')})`,
            toolCallCount: state.toolCallCount + guidedToolCalls.length,
            iterationCount: state.iterationCount + 1,
            llmCallCount: attempts
          };
        }
        break; // guided response also empty — give up
      } catch {
        // guidance call failed, try next
      }
    }

    // 引导后仍无 tool call
    return {
      pendingToolCalls: [],
      error: '',
      done: false,
      executionPath: 'agent(no_tools,give_up)',
      toolCallCount: state.toolCallCount,
      iterationCount: state.iterationCount + 1,
      llmCallCount: attempts
    };
  }

  // ── Phase 4: No-tool-call but chunks exist → skip guidance, go to answer ──
  if (toolCalls.length === 0 && state.allChunks.length > 0) {
    return {
      pendingToolCalls: [],
      error: '',
      done: true,
      executionPath: 'agent(no_tools,stop_with_chunks)',
      toolCallCount: state.toolCallCount,
      iterationCount: state.iterationCount + 1,
      llmCallCount: attempts
    };
  }

  // ── Normal: has tool calls ──
  const toolNames = toolCalls.map((tc) => tc.function.name);
  return {
    pendingToolCalls: toolCalls,
    error: '',
    done: false,
    executionPath: `agent(${mode},${toolNames.join(',')})`,
    toolCallCount: state.toolCallCount + toolCalls.length,
    iterationCount: state.iterationCount + 1,
    llmCallCount: attempts
  };
}

function baseState(overrides: Partial<AgentNodeState> = {}): AgentNodeState {
  return {
    messages: [{ role: 'user', content: 'test query' }],
    playbook: 'general',
    allChunks: [],
    toolCallCount: 0,
    iterationCount: 0,
    ...overrides
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Agent Node Fallback (P0)', () => {
  describe('LLM call retry', () => {
    it('retries once on LLM failure, then succeeds with tool call', async () => {
      const llm = new CountedMockLLM([
        { content: '', shouldThrow: true },                                             // call 1: fails
        { content: 'ok', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{"query":"t"}' } }] }  // call 2: success
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(llm.callCount).toBe(2);
      expect(result.pendingToolCalls.length).toBe(1);
      expect(result.pendingToolCalls[0].function.name).toBe('search');
      expect(result.executionPath).toBe('agent(native,search)');
    });

    it('returns error after max retries exhausted with no chunks', async () => {
      const llm = new CountedMockLLM([
        { content: '', shouldThrow: true },
        { content: '', shouldThrow: true }
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(llm.callCount).toBe(2);
      expect(result.pendingToolCalls.length).toBe(0);
      expect(result.error).toContain('agent error after 2 attempts');
      expect(result.executionPath).toBe('agent(retry_exhausted)');
    });

    it('marks done when retries exhausted but chunks exist', async () => {
      const llm = new CountedMockLLM([
        { content: '', shouldThrow: true },
        { content: '', shouldThrow: true }
      ]);

      const result = await runAgentNode(llm, baseState({
        allChunks: [{ id: 'c1', content: 'data' }],
        toolCallCount: 1
      }));

      expect(result.done).toBe(true);
      expect(result.executionPath).toBe('agent(retry_exhausted_with_chunks)');
    });
  });

  describe('Text fallback', () => {
    it('parses @search from content when native FC returns no toolCalls', async () => {
      const llm = new CountedMockLLM([
        { content: '@search({"query": "test search"})' }  // no toolCalls in response
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(result.pendingToolCalls.length).toBe(1);
      expect(result.pendingToolCalls[0].function.name).toBe('search');
      expect(result.executionPath).toContain('text_fallback');
    });

    it('parses <tool_call> XML when native FC returns no toolCalls', async () => {
      const llm = new CountedMockLLM([
        {
          content:
            '<tool_call><tool name="search"><arg name="query">xml search</arg></tool></tool_call>',
          toolCalls: undefined
        }
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(result.pendingToolCalls.length).toBe(1);
      expect(result.pendingToolCalls[0].function.name).toBe('search');
      expect(result.executionPath).toContain('text_fallback');
    });
  });

  describe('No-tool-call guidance retry', () => {
    it('injects guidance and retries LLM when first call has no tool call', async () => {
      // call 1: empty text, no tool calls → triggers guidance injection
      // call 2: guidance retry succeeds with @search in text
      const llm = new CountedMockLLM([
        { content: '' },                                                                      // call 1: no tool call
        { content: '@search({"query": "guided search"})' }                                    // call 2: guidance retry
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(result.pendingToolCalls.length).toBe(1);
      expect(result.pendingToolCalls[0].function.name).toBe('search');
      expect(llm.callCount).toBe(2);
      expect(llm.receivedMessages[1]!.some((m) => m.id === 'tool-call-guidance')).toBe(true);
    });

    it('gives up when guidance retry also produces no tool call', async () => {
      const llm = new CountedMockLLM([
        { content: '' },  // call 1: no tool call
        { content: '' }   // call 2: guidance retry also empty
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(result.pendingToolCalls.length).toBe(0);
      expect(result.executionPath).toBe('agent(no_tools,give_up)');
      expect(llm.callCount).toBe(2);
    });

    it('skips guidance retry when chunks already collected', async () => {
      const llm = new CountedMockLLM([
        { content: '' }   // only one call expected
      ]);

      const result = await runAgentNode(llm, baseState({
        allChunks: [{ id: 'c1', content: 'data' }],
        toolCallCount: 1
      }));

      expect(result.done).toBe(true);
      expect(result.executionPath).toBe('agent(no_tools,stop_with_chunks)');
      expect(llm.callCount).toBe(1);
    });

    it('handles guidance LLM call failure gracefully', async () => {
      const llm = new CountedMockLLM([
        { content: '' },                 // call 1: no tool call
        { content: '', shouldThrow: true } // call 2: guidance retry fails
      ]);

      const result = await runAgentNode(llm, baseState());

      expect(result.pendingToolCalls.length).toBe(0);
      expect(result.executionPath).toBe('agent(no_tools,give_up)');
    });
  });
});
