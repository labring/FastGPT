// src/agent/tools.ts
// Tool 工厂 - 为 Agent 生成可调用的 Tools（闭包注入 RequestContext）
// 同时包含 LangGraph 图节点使用的 AGENT_TOOLS schema 和文本 ReAct 解析器

import type { RequestContext } from './context';
import type { ToolDefinition } from '../types/message';
import { TOOLS } from '../utils/constants';
import { getPlaybookContent } from './playbooks/templates';
import { stripThinkBlocks, TEXT_REACT_INSTRUCTION } from '../utils/text';

// ============================================================
// LangGraph 图节点使用的 Tool schema（OpenAI function calling 格式）
// ============================================================

export interface ToolDefinitionItem {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const AGENT_TOOLS: ToolDefinitionItem[] = [
  {
    name: TOOLS.SEARCH,
    description:
      'Search the knowledge base for relevant information. Use this to find documents that can help handle the user question.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple queries for parallel search'
        }
      }
    }
  },
  {
    name: TOOLS.QUERY_REWRITE,
    description:
      'Rewrite user query to improve search results. Also use to translate search queries into the KB document language when the user asked in a different language. Use when initial search returns poor results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Original query to rewrite' }
      },
      required: ['query']
    }
  },
  {
    name: TOOLS.SUMMARY,
    description:
      'Generate final answer based on retrieved information. Use this when you have enough information to answer.',
    inputSchema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'Reasoning process based on search results' }
      },
      required: ['reasoning']
    }
  },
  {
    name: TOOLS.ASSESS,
    description:
      'Assess information sufficiency after searching. For deep_research, troubleshooting, comparative_analysis only. Call after every @search to record findings, update lacks, and annotate useful chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: { type: 'string' },
          description: 'New valuable information found this round ([] if none)'
        },
        lacks: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Complete current list of still-missing info (snapshot). Pass [] if sufficient.'
        },
        sufficient: {
          type: 'boolean',
          description: 'True if ready to answer, False if more search needed'
        },
        key_chunks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chunk_id: { type: 'string', description: 'ID of the useful chunk' },
              key_info: { type: 'string', description: 'Extracted snippet (null = entire chunk)' }
            },
            required: ['chunk_id']
          },
          description: 'Useful chunks from recent @search results to annotate'
        }
      },
      required: ['findings', 'lacks', 'sufficient']
    }
  }
];

// LLM function calling 格式的工具定义
export const TOOL_DEFINITIONS: ToolDefinition[] = AGENT_TOOLS.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>
  }
}));

// ============================================================
// Text ReAct 解析器
// ============================================================

/**
 * 解析 @tool_name(args) 格式（单个调用）
 * 对齐 Python parse_text_tool_call，使用 stripThinkBlocks 清理 LLM 输出
 */
export function parseTextToolCall(
  content: string
): { name: string; args: Record<string, unknown> } | null {
  // 使用 stripThinkBlocks 对齐 Python strip_think_blocks
  const cleaned = stripThinkBlocks(content);
  // 从 AGENT_TOOLS 动态获取已注册的工具名，避免硬编码
  const registeredToolNames = new Set(AGENT_TOOLS.map((t) => t.name));
  const toolNamePattern = Array.from(registeredToolNames).join('|');
  const match = cleaned.match(new RegExp(`@(${toolNamePattern})\\b\\s*(?:\\(([^)]*)\\))?`));
  if (!match) return null;

  const toolName = match[1];
  const argsStr = match[2] || '';

  try {
    if (argsStr.trim() === '') {
      return { name: toolName, args: {} };
    }
    return { name: toolName, args: JSON.parse(argsStr) };
  } catch {
    return { name: toolName, args: { query: argsStr } };
  }
}

/**
 * 解析 <tool_call> XML 格式（Qwen3/Hermes vLLM chat template）
 * 对齐 Python parse_tool_call_xml，使用 stripThinkBlocks 清理 LLM 输出
 */
export function parseToolCallXml(
  content: string
): Array<{ name: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // 使用 stripThinkBlocks 对齐 Python strip_think_blocks
  const cleaned = stripThinkBlocks(content);
  // 从 AGENT_TOOLS 动态获取已注册的工具名，避免硬编码
  const registeredToolNames = new Set(AGENT_TOOLS.map((t) => t.name));
  const toolNamePattern = Array.from(registeredToolNames).join('|');
  const regex = new RegExp(
    `<tool_call>\\s*<tool name="(${toolNamePattern})"[^>]*>([\\s\\S]*?)<\\/tool>\\s*<\\/tool_call>`,
    'g'
  );
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    const toolName = match[1];
    const argsStr = match[2];

    try {
      const args: Record<string, unknown> = {};
      const argRegex = /<arg name="(\w+)">([^<]*)<\/arg>/g;
      let argMatch;
      while ((argMatch = argRegex.exec(argsStr)) !== null) {
        args[argMatch[1]] = argMatch[2];
      }
      toolCalls.push({ name: toolName, args });
    } catch {
      // 忽略解析错误
    }
  }

  return toolCalls;
}

/**
 * 解析 MiniMax [TOOL_CALL] 格式
 * 示例:
 *   [TOOL_CALL]
 *   {tool => "search", args => {
 *     --queries ["vNGAF 产品介绍", "vADC 产品介绍"]
 *   }}
 *   [/TOOL_CALL]
 *
 * MiniMax 的 args 使用 Ruby-like hash 语法:
 *   --key value  或  key => value
 *   数组: ["item1", "item2"]
 */
export function parseToolCallMinimax(
  content: string
): Array<{ name: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cleaned = stripThinkBlocks(content);
  // 匹配 [TOOL_CALL]...[/TOOL_CALL] 块
  const blockRegex = /\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/g;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(cleaned)) !== null) {
    const block = blockMatch[1];
    // 提取 tool 名称: {tool => "name", ...
    const toolMatch = block.match(/tool\s*=>\s*"(\w+)"/);
    if (!toolMatch) continue;
    const toolName = toolMatch[1];

    // 提取 args 部分: args => { ... }
    // 使用非贪婪匹配找到 args => { 后的第一个闭合 }
    const argsStart = block.indexOf('args');
    if (argsStart === -1) {
      toolCalls.push({ name: toolName, args: {} });
      continue;
    }

    // 从 args => 之后找第一个 {，然后平衡匹配到对应的 }
    const afterArgs = block.slice(argsStart);
    const firstBrace = afterArgs.indexOf('{');
    if (firstBrace === -1) {
      toolCalls.push({ name: toolName, args: {} });
      continue;
    }

    let braceDepth = 0;
    let inString = false;
    let escaped = false;
    let argsBody = '';
    const body = afterArgs.slice(firstBrace + 1); // 跳过第一个 {

    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (escaped) {
        escaped = false;
        argsBody += c;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        argsBody += c;
        continue;
      }
      if ((c === '"' || c === "'") && !escaped) {
        inString = !inString;
        argsBody += c;
        continue;
      }
      if (!inString) {
        if (c === '{') braceDepth++;
        else if (c === '}') {
          if (braceDepth === 0) break; // 找到闭合的 }
          braceDepth--;
        }
      }
      argsBody += c;
    }

    try {
      const args: Record<string, unknown> = {};

      // 1. 先提取 --key value 格式（MiniMax 特有）
      // 匹配 --key value 或 --key ["a", "b"] 格式
      const dashRegex = /--(\w+)\s+([\s\S]*?)(?=\s+--\w+\s|$)/g;
      let dashMatch;
      while ((dashMatch = dashRegex.exec(argsBody)) !== null) {
        const key = dashMatch[1];
        const valueStr = dashMatch[2].trim();
        args[key] = parseMinimaxValue(valueStr);
      }

      // 2. 再提取 key => value 格式
      const arrowRegex = /(\w+)\s*=>\s*([\s\S]*?)(?=,\s*\w+\s*=>|$)/g;
      let arrowMatch;
      while ((arrowMatch = arrowRegex.exec(argsBody)) !== null) {
        const key = arrowMatch[1];
        // 跳过已处理的 --key
        if (key.startsWith('-')) continue;
        const valueStr = arrowMatch[2].trim();
        args[key] = parseMinimaxValue(valueStr);
      }

      toolCalls.push({ name: toolName, args });
    } catch {
      toolCalls.push({ name: toolName, args: { raw: argsBody } });
    }
  }

  return toolCalls;
}

/**
 * 解析 MiniMax 格式的值（字符串、数组、对象）
 */
function parseMinimaxValue(valueStr: string): unknown {
  const trimmed = valueStr.trim();

  // 数组: ["item1", "item2"] 或 [item1, item2]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      // 尝试作为 JSON 数组解析
      const jsonLike = trimmed.replace(/(\w+)\s*=>/g, '"$1":').replace(/'([^']*)'/g, '"$1"');
      return JSON.parse(jsonLike);
    } catch {
      // 手动分割数组元素
      const inner = trimmed.slice(1, -1);
      const items: string[] = [];
      let current = '';
      let inString = false;
      let escaped = false;

      for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (escaped) {
          escaped = false;
          current += c;
          continue;
        }
        if (c === '\\') {
          escaped = true;
          current += c;
          continue;
        }
        if (c === '"' && !escaped) {
          inString = !inString;
          current += c;
          continue;
        }
        if (c === ',' && !inString) {
          items.push(current.trim());
          current = '';
          continue;
        }
        current += c;
      }
      if (current.trim()) items.push(current.trim());

      // 去除引号
      return items.map((item) => {
        const t = item.trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          return t.slice(1, -1);
        }
        return t;
      });
    }
  }

  // 对象: { key => value }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const jsonLike = trimmed.replace(/(\w+)\s*=>/g, '"$1":').replace(/'([^']*)'/g, '"$1"');
      return JSON.parse(jsonLike);
    } catch {
      return trimmed;
    }
  }

  // 字符串（去除引号）
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 布尔值
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  return trimmed;
}

/**
 * 从文本中解析所有 tool calls（XML 格式优先，降级 @tool_name 格式）
 * 对齐 Python parse_text_tool_calls，使用 stripThinkBlocks 清理 LLM 输出
 */
export function parseAllToolCalls(
  content: string
): Array<{ name: string; args: Record<string, unknown> }> {
  // 使用 stripThinkBlocks 对齐 Python strip_think_blocks
  const cleaned = stripThinkBlocks(content);

  // 1. 解析 <invoke> XML 格式（MiniMax 等模型使用，带 name 属性）
  const invokeCalls = parseInvokeXml(cleaned);
  if (invokeCalls.length > 0) return invokeCalls;

  // 2. 解析 <tool_call> XML 格式（Qwen3/Hermes vLLM chat template）
  const xmlCalls = parseToolCallXml(cleaned);
  if (xmlCalls.length > 0) return xmlCalls;

  // 3. 解析 MiniMax [TOOL_CALL] 格式
  const minimaxCalls = parseToolCallMinimax(cleaned);
  if (minimaxCalls.length > 0) return minimaxCalls;

  // 4. 解析 <tool_name> 直接标签格式（MiniMax 等模型使用）
  const directTagCalls = parseDirectTagXml(cleaned);
  if (directTagCalls.length > 0) return directTagCalls;

  // 5. 降级 @tool_name 格式
  // 注意：必须排除 Markdown 列表项（行首空格/破折号后跟 @）、email 地址等误匹配场景
  // 只匹配行首（或换行后）直接以 @tool_name 开头，或 @tool_name({...}) 的有效工具调用
  const atCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // 从 AGENT_TOOLS 动态获取已注册的工具名，避免硬编码
  const registeredToolNames = new Set(AGENT_TOOLS.map((t) => t.name));
  const toolNamePattern = Array.from(registeredToolNames).join('|');
  // 匹配模式：行首或换行后直接跟 @tool_name，前面不能有非空白字符（排除 email 等）
  const regex = new RegExp(`(?:^|\\n)\\s*@(${toolNamePattern})\\b\\s*(?:\\(([^)]*)\\))?`, 'g');
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    const toolName = match[1];
    const argsStr = match[2] || '{}';
    try {
      const args = argsStr.trim() === '' ? {} : JSON.parse(argsStr);
      atCalls.push({ name: toolName, args });
    } catch {
      atCalls.push({ name: toolName, args: { query: argsStr } });
    }
  }

  return atCalls;
}

/**
 * 解析 <invoke> XML 格式（MiniMax 等模型使用）
 * 示例:
 *   <minimax:tool_call>
 *   <invoke name="search">
 *   <parameter name="query">超融合 默认地址 管理地址</parameter>
 *   </invoke>
 *   </minimax:tool_call>
 */
function parseInvokeXml(content: string): Array<{ name: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cleaned = stripThinkBlocks(content);

  // 从 AGENT_TOOLS 动态获取已注册的工具名，避免硬编码
  const registeredToolNames = new Set(AGENT_TOOLS.map((t) => t.name));
  const toolNamePattern = Array.from(registeredToolNames).join('|');
  // 匹配 <invoke name="tool_name">...</invoke> 块
  const invokeRegex = new RegExp(
    `<invoke\\s+name="(${toolNamePattern})"[^>]*>([\\s\\S]*?)<\\/invoke>`,
    'g'
  );
  let invokeMatch;

  while ((invokeMatch = invokeRegex.exec(cleaned)) !== null) {
    const toolName = invokeMatch[1];
    const paramsStr = invokeMatch[2];

    try {
      const args: Record<string, unknown> = {};
      // 匹配 <parameter name="key">value</parameter>
      const paramRegex = /<parameter\s+name="(\w+)"[^>]*>([\s\S]*?)<\/parameter>/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
        const key = paramMatch[1];
        const value = paramMatch[2].trim();
        // 尝试解析为 JSON（数组等），失败则保留字符串
        try {
          args[key] = JSON.parse(value);
        } catch {
          args[key] = value;
        }
      }
      toolCalls.push({ name: toolName, args });
    } catch {
      // 忽略解析错误
    }
  }

  return toolCalls;
}

/**
 * 解析 <tool_name> 直接标签格式（MiniMax 等模型使用）
 * 示例:
 *   <minimax:tool_call>
 *   <search>
 *   <query>公司员工人数 员工总数</query>
 *   </search>
 *   </minimax:tool_call>
 *
 * 支持的标签: <search>, <query_rewrite>, <answer>
 */
function parseDirectTagXml(
  content: string
): Array<{ name: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cleaned = stripThinkBlocks(content);

  // 从 AGENT_TOOLS 动态获取已注册的工具名，避免硬编码
  const registeredToolNames = new Set(AGENT_TOOLS.map((t) => t.name));
  const toolNamePattern = Array.from(registeredToolNames).join('|');
  const tagRegex = new RegExp(
    `<(${toolNamePattern})\\b[^\\u003e]*>([\\s\\S]*?)<\\/(${toolNamePattern})>`,
    'g'
  );
  let tagMatch;

  while ((tagMatch = tagRegex.exec(cleaned)) !== null) {
    const toolName = tagMatch[1];
    const innerContent = tagMatch[2];

    try {
      const args: Record<string, unknown> = {};
      // 提取所有子标签作为参数: <key>value</key>
      const paramRegex = /<(\w+)\b[^\u003e]*>([\s\S]*?)<\/\1>/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
        const key = paramMatch[1];
        // 跳过与工具名相同的标签（那是外层标签）
        if (key === toolName) continue;
        const value = paramMatch[2].trim();
        // 尝试解析为 JSON（数组等），失败则保留字符串
        try {
          args[key] = JSON.parse(value);
        } catch {
          args[key] = value;
        }
      }
      toolCalls.push({ name: toolName, args });
    } catch {
      // 忽略解析错误
    }
  }

  return toolCalls;
}

// ============================================================
// System Prompt 构建器
// ============================================================

/**
 * 生成 text ReAct 模式的 tool description
 * 对齐 Python build_text_react_prompt
 */
export function buildTextReactPrompt(): string {
  // 对齐 Python: 使用 TEXT_REACT_INSTRUCTION + render_text_description_and_args
  const toolDescriptions = AGENT_TOOLS.map((t) => `- @${t.name}: ${t.description}`).join('\n');
  // 使用 utils/text.ts 中的 TEXT_REACT_INSTRUCTION
  return TEXT_REACT_INSTRUCTION.replace('{tool_descriptions}', toolDescriptions);
}

export function getSystemPrompt(playbook: string, searchOnly?: boolean): string {
  const playbookContent = getPlaybookContent(playbook, searchOnly);
  return searchOnly
    ? buildSearchOnlySystemPrompt(playbookContent)
    : buildAnswerSystemPrompt(playbookContent);
}

function buildAnswerSystemPrompt(playbookContent: string): string {
  return `You are DiTing, an enterprise knowledge base QA assistant. You handle questions \
by searching internal knowledge bases and synthesizing information from retrieved documents.

## IRON LAW — Gather Information First, Always

**STOP. Before calling @summary, you MUST gather sufficient information. Use @query_rewrite to optimize the query if needed, then @search to retrieve chunks.**

You are in a multi-turn conversation. Previous AI responses exist in the chat history — \
they are for context reference ONLY. They are NOT a knowledge source.

- Do NOT copy, quote, or cite any information from previous AI responses.
- Do NOT answer directly from memory or from chat history content.
- For EVERY new question, you MUST gather information first. Consider using @query_rewrite for complex/vague queries, then @search to retrieve fresh information.
- You MUST use @summary to generate the final answer.
- Only cite chunks returned by @search in the CURRENT turn.

If you call @summary without gathering sufficient information first, you are violating this law.

## Core Rules
1. All answers MUST be grounded in retrieved knowledge chunks. Never fabricate information.
2. Cite sources using [id-xxx] inline, immediately after the relevant statement.
3. If knowledge is insufficient, explicitly state what is missing and suggest next steps.
4. **Language Strategy**:
   - FINAL ANSWER: MUST be in the user's question language.
   - SEARCH QUERIES: Write in the KB's document language (specified in [LANGUAGE DIRECTIVE]), NOT necessarily the user's language.
     If the user asks in Arabic but the KB is Chinese, search in Chinese — this is the single most important factor for recall.
     If you don't know the KB language, search in the user's language first, then observe results and adapt.
   - When the user's language differs from the KB language: use @query_rewrite to generate search queries in the KB language.
     @query_rewrite can translate your search intent into the document language — it will produce natural queries, not word-for-word translations.

## Question Analysis

When you receive a question, analyze it thoroughly before searching:

1. **Extract key elements**: core question, constraints (product, version, scenario, time), \
expected answer form (fact, steps, comparison, list).
2. **Identify special entities**: product names, error codes, config items — preserve exactly.
3. **Clarify the expected answer type** — this determines your output strategy:
   - A direct factual answer ("What is X?")
   - A step-by-step procedure ("How to configure X?")
   - A document or resource link ("Where is the deployment guide?")
   - A comparison report ("Differences between A and B?")
   - A multi-dimensional summary ("Overview of X features")
   - A diagnostic solution ("Error 789, how to fix?")
4. **Handle time references**: if the question mentions relative time (e.g., "recent", \
"latest"), interpret relative to the current date.
5. **Classify query type** to guide your search strategy:

| Type | Pattern | Search Strategy |
|------|---------|-----------------|
| **Direct** | Focused, single-fact question | One @search, then @summary |
| **Depth-First** | Chain reasoning, step N depends on step N-1 | Sequential searches, each informed by previous results |
| **Breadth-First** | Multiple independent sub-questions | Use JSON array: @search({"queries": ["Q1", "Q2"]}) for parallel execution |
| **Compound** | Mix of depth-first and breadth-first | Plan sequential + parallel phases |

Priority when ambiguous: Compound > Depth-First > Breadth-First > Direct.

## Search Planning

Before your first search, briefly plan your approach:
- **Direct**: search the original query directly, no planning needed.
- **Breadth-First**: list all objects/dimensions to cover; use JSON array for parallel search: \
@search({"queries": ["Q1", "Q2", "Q3"]})
- **Depth-First**: identify the dependency chain; search the prerequisite first, \
then decide the next search based on results.
- **Compound**: outline which phases are sequential and which are parallel.

Revise your plan as new information emerges — the plan is a guide, not a rigid script.

## Circular Search Execution

Execute searches in an iterative loop:

\`\`\`
loop {
  (1) Observe: review collected information, assess coverage
  (2) Decide: what is still missing? what query will fill the gap?
  (3) Act: call @search, @query_rewrite, or @summary
} until information is sufficient
\`\`\`

### Search Techniques
- **Multi-condition queries**: search with all conditions first. If results are insufficient, \
relax one condition at a time (starting with the least important), search again, then filter \
results against the removed condition.
- **Poor results**: use @query_rewrite to rephrase. Try up to 3 times with different angles \
before concluding information is unavailable. Do not give up after one failed search.
- **Breadth-first / comparison**: use @query_rewrite({"query": "...", "strategy": "decompose"}) to decompose. \
When the rewrite result shows **parallel=true**, you MUST use JSON array format: @search({"queries": ["Q1", "Q2"]}). \
NEVER call @search multiple times for parallel sub-queries.
- **Chain dependencies**: search prerequisite info first, decide next query from results.
- **Critical facts** (numbers, dates, config values): verify from source, do not assume.
- Never repeat the exact same search query.
- Do not reduce searches for efficiency — prioritize information completeness.

## Answer Generation

When you have sufficient information, call @summary. Before calling, confirm:
- All aspects of the user's question are covered.
- Key facts are cross-verified where possible.
- For comparisons, information on ALL objects has been collected.
- The answer type matches the user's intent (e.g., if they asked to "find a document", \
ensure the answer includes document names and links, not just a summary of the content).

If @summary's reflection result is unfaithful or incomplete:
- Search for the missing information, then call @summary again.

## Constraints

- Total tool calls ≤ 10
- @search calls ≤ 5
- Always use @summary to generate the final response (do NOT write the answer yourself)
- If repeated searches find nothing relevant, call @summary to produce an honest \
"insufficient information" response with known clues and suggestions.

## Tools
- @search({"query": "..."}) or @search({"queries": ["Q1", "Q2"]}) — search knowledge base
- @query_rewrite({"query": "..."}) — rewrite query to improve search results
- @assess({"findings": [...], "lacks": [...], "sufficient": bool}) — (deep_research/troubleshooting/comparative_analysis only) record findings and gaps after searching. Optional but recommended for multi-step research.
- @summary({"reasoning": "..."}) — generate final answer from retrieved chunks

## CRITICAL — Language Rule

Your FINAL ANSWER must match the user's question language. \
Your @search query language should target document language for maximum recall — \
follow the [LANGUAGE DIRECTIVE] for the default, and adapt per-topic from search results.
If the user asks in Chinese, your final answer MUST be in Chinese — \
even if you searched in other languages.

${playbookContent}`;
}

function buildSearchOnlySystemPrompt(playbookContent: string): string {
  return `You are DiTing, an enterprise knowledge base search assistant. \
Your task is to retrieve relevant knowledge base chunks.

## Operation Mode: Search-Only

You retrieve supplementary knowledge base chunks. The final answer is generated externally.

**GLOBAL RULE: Do NOT call @summary. When your searches are complete, simply stop (make no more tool calls).**

## STEP 0 — MANDATORY: Evaluate Search Hints Before Any Search

**Execute this check FIRST. Do NOT call any tool before completing this evaluation.**

The Search Hints (in the ## Search Hints section) contain information already retrieved from \
external authoritative sources (SQL databases, APIs, external systems). \
They are NOT documents to search for — they are pre-retrieved facts.

**Ask yourself: Does the hint DIRECTLY and COMPLETELY answer the user's exact question?**

- **YES → STOP IMMEDIATELY. Call no tools at all.** The hint is the answer; no KB search is needed.
- **NO → Proceed to the search steps in the scenario guidance below.**

**Decision examples:**
- Question: "该产品最大并发连接数是多少" / Hint: "[文档] 最大并发连接数为10000" → **STOP** (the number is already provided)
- Question: "最近一周内新增的告警有哪些" / Hint: "[查询结果] 告警A, 告警B, 告警C" → **STOP** (the list is complete)
- Question: "X产品默认管理员账号是什么" / Hint: "alias: X产品=XProduct" → **CONTINUE** (alias mapping, not the answer)
- Question: "Y功能支持哪些部署模式" / Hint: "产品类型: Y功能, Y-Lite功能" → **CONTINUE** (supplementary context, not a complete list)

## Core Rules
1. Search knowledge base only — do NOT answer from memory or chat history.
2. Language: SEARCH QUERIES should target document language for maximum recall. \
Default language is in [LANGUAGE DIRECTIVE]. Adapt per-topic from search results.
3. Treat Search Hints as authoritative pre-retrieved facts, not as search queries.

## Search Techniques
- **Parallel search**: @search({"queries": ["Q1", "Q2"]}) for independent queries.
- **Sequential search**: search prerequisite first, then decide next query from results.
- **Poor results**: use @query_rewrite to rephrase. Try from a different angle.
- **Alias hints**: if Search Hints provide alias mappings (e.g. "alias: A=B"), search with BOTH terms.
- Never repeat the exact same search query.
- Never use hint content verbatim as a search query.

## Constraints
- @search calls ≤ 5
- Do NOT call @summary

${playbookContent}`;
}

// ============================================================
// RequestContext 注入工厂（供 nodes.ts 使用，闭包注入 context）
// ============================================================

/**
 * Tool 定义
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * 创建 search tool
 */
export function createSearchTool(_context: RequestContext): AgentTool {
  return {
    name: TOOLS.SEARCH,
    description:
      'Search for relevant documents from the knowledge base. Input: { queries: string[], datasetIds: string[] }. Output: { chunks: ChunkItem[], queries: string[] }',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Search queries'
        },
        datasetIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dataset IDs to search in'
        }
      },
      required: ['queries', 'datasetIds']
    }
  };
}

/**
 * 创建 query_rewrite tool
 */
export function createQueryRewriteTool(_context: RequestContext): AgentTool {
  return {
    name: TOOLS.QUERY_REWRITE,
    description:
      'Rewrite or translate user query for better search results. Input: { query: string }. Output: { queries: string[] }. Use when KB language differs from user language, or when initial search returns poor results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Original user query'
        }
      },
      required: ['query']
    }
  };
}

/**
 * 创建 summary tool
 */
export function createAnswerTool(_context: RequestContext): AgentTool {
  return {
    name: TOOLS.SUMMARY,
    description:
      'Generate answer from retrieved chunks. Input: { query: string, chunks: ChunkItem[] }. Output: { answer: string, citedIds: string[] }',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User question'
        },
        mode: {
          type: 'string',
          enum: ['search', 'chat'],
          default: 'chat',
          description: 'Mode: search returns chunks, chat generates answer'
        }
      },
      required: ['query']
    }
  };
}

/**
 * 创建 chunk_selector tool
 */
export function createChunkSelectorTool(_context: RequestContext): AgentTool {
  return {
    name: TOOLS.CHUNK_SELECTOR,
    description:
      'Select most relevant chunks based on token budget. Input: { query: string, chunks: ChunkItem[], tokenBudget: number }. Output: { selectedChunks: ChunkItem[] }',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User question'
        },
        tokenBudget: {
          type: 'number',
          description: 'Token budget for selection',
          default: 8000
        }
      },
      required: ['query']
    }
  };
}

/**
 * 创建所有 tools
 */
export function createTools(context: RequestContext): AgentTool[] {
  return [
    createSearchTool(context),
    createQueryRewriteTool(context),
    createAnswerTool(context),
    createChunkSelectorTool(context)
  ];
}

/**
 * 转换为 LangChain/LangGraph 格式
 */
export function toLangChainTools(context: RequestContext): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return createTools(context).map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}
