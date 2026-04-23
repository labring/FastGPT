// src/utils/prompt_loader.ts
// 提示词加载器 - 从 TS 模块加载（内置于 package 中）

import {
  playbooks,
  routerRules,
  chunkSelectorPrompts,
  type PlaybookDef,
  type RouterRule
} from '../prompts/playbooks/index';
import { rewriteStrategies, rewriteStrategyPrompts } from '../prompts/query_rewrite/index';
import { type ChatHistorySummary } from './compression';

/**
 * 加载 playbook 定义
 */
export function loadPlaybook(name: string): PlaybookDef {
  const playbook = playbooks[name];
  if (!playbook) {
    throw new Error(`Playbook not found: ${name}`);
  }
  return playbook;
}

/**
 * 加载全部 playbook
 */
export function loadAllPlaybooks(): PlaybookDef[] {
  return Object.values(playbooks);
}

/**
 * 加载 router 规则
 */
export function loadRouterRules(): RouterRule[] {
  return routerRules;
}

/**
 * 加载 query rewrite 策略定义
 */
export function loadRewriteStrategy(
  name: string
): { name: string; description: string } | undefined {
  return rewriteStrategies[name];
}

/**
 * 加载 query rewrite 策略 prompt
 */
export function loadRewriteStrategyPrompt(name: string): string {
  const prompt = rewriteStrategyPrompts[name];
  if (!prompt) {
    throw new Error(`Rewrite strategy prompt not found: ${name}`);
  }
  return prompt;
}

/**
 * 加载全部 rewrite 策略
 */
export function loadAllRewriteStrategies(): { name: string; description: string }[] {
  return Object.values(rewriteStrategies);
}

/**
 * 加载 chunk selector prompt
 */
export function loadChunkSelectorPrompt(playbook: string, stage: 1 | 2): string {
  const prompts = chunkSelectorPrompts[playbook] || chunkSelectorPrompts.general;
  return stage === 1 ? prompts.stage1 : prompts.stage2;
}

// ============================================================
// Classifier Prompt Builder（canonical 版本，streaming/non-streaming 共用）
// ============================================================

export type BuildClassifierPromptOptions = {
  playbookDescriptions: string;
  priorContext: string;
  summary: ChatHistorySummary | null;
  question: string;
  lang: string;
};

/**
 * 构建分类器 prompt
 * 合并了 Decision Guidelines（精准指导）+ few-shot examples（分类示例）+ 语言要求
 */
export function buildClassifierPrompt(options: BuildClassifierPromptOptions): string {
  const { playbookDescriptions, priorContext, summary, question, lang } = options;

  const summaryStr = summary ? summary.summary : 'No additional chat_history';

  const previousPlaybooksSection = summary?.previousPlaybooks?.length
    ? `## Previous Question Types:\n- ${summary.previousPlaybooks.join('\n- ')}`
    : '## Previous Question Types:\nNone';

  const entitiesSection = summary?.entities?.length
    ? `## Key Entities from History:\n- ${summary.entities.join('\n- ')}`
    : '## Key Entities from History:\nNone';

  const fewShotExamples =
    lang === 'zh'
      ? `
## Few-shot Examples

**Example 1**
Question: "云端部署和本地部署有什么区别？"
Classification: {"playbook": "comparative_analysis", "analysis": "我需要分别检索云端部署和本地部署在架构设计、运维成本、数据安全性、扩展性、网络依赖等维度的信息，然后逐项对比差异。", "reason": "包含关键词'区别'"}

**Example 2**
Question: "用户登录失败怎么排查？"
Classification: {"playbook": "troubleshooting", "analysis": "我需要检索常见的登录失败原因，包括：凭证错误、网络连接问题、认证服务状态、权限配置、账户锁定策略等，然后整理成系统性的排查步骤。", "reason": "包含关键词'失败'和'怎么'"}

**Example 3**
Question: "该产品支持哪些操作系统？"
Classification: {"playbook": "deep_research", "analysis": "我需要检索该产品支持的所有操作系统版本，覆盖不同平台（Windows、Linux、macOS）以及对应的最低版本要求和推荐配置。", "reason": "包含关键词'哪些'"}

**Example 4**
Question: "那配置步骤呢？"
Classification: {"playbook": "followup_query", "analysis": "我需要基于已有上下文，检索剩余未覆盖的配置环节，确保与之前讨论的内容衔接一致，避免重复。", "reason": "包含追问关键词'那'"}

**Example 5**
Question: "怎么优化数据库查询性能？"
Classification: {"playbook": "deep_research", "analysis": "我需要检索多个维度的优化手段：索引设计与优化、SQL查询语句改写、连接池配置、缓存策略、数据库参数调优、硬件资源规划等，给出一个系统性的优化方案。", "reason": "问题涉及多个优化维度，需要全面覆盖"}

**Negative Example** (DO NOT follow this style)
Question: "某产品的默认密码是什么？"
Bad: {"playbook": "simple_query", "analysis": "用户需要获取某产品默认密码这一具体事实信息。问题明确直接，预期答案是具体的密码值。", "reason": "..."}
→ 错误：analysis 只是在描述问题，没有说明检索动作。

Corrected: {"playbook": "simple_query", "analysis": "我需要检索某产品的官方文档或安装手册中关于默认管理员账户密码的说明，直接提取初始登录凭证。", "reason": "单一事实性查询，询问具体的默认密码值，意图明确，无需多维度分析或问题排查"}`
      : `
## Few-shot Examples

**Example 1**
Question: "What are the differences between cloud deployment and on-premise deployment?"
Classification: {"playbook": "comparative_analysis", "analysis": "I need to retrieve information for both cloud and on-premise deployment across architecture design, operational cost, data security, scalability, and network dependency dimensions, then compare them side by side.", "reason": "Contains keyword 'differences'"}

**Example 2**
Question: "User login failed, how to troubleshoot?"
Classification: {"playbook": "troubleshooting", "analysis": "I need to look up common causes including: credential errors, network connectivity issues, authentication service status, permission configuration, and account lockout policies, then organize them into systematic diagnostic steps.", "reason": "Contains keyword 'failed'"}

**Example 3**
Question: "What operating systems does this product support?"
Classification: {"playbook": "deep_research", "analysis": "I need to retrieve all supported operating system versions across platforms (Windows, Linux, macOS) including minimum requirements and recommended configurations.", "reason": "Contains keyword 'what'"}

**Example 4**
Question: "What about the configuration steps?"
Classification: {"playbook": "followup_query", "analysis": "I need to retrieve the remaining configuration procedures not yet covered based on previous context, ensuring consistency with the earlier discussion and avoiding repetition.", "reason": "Contains follow-up phrase 'what about'"}

**Example 5**
Question: "How to optimize database query performance?"
Classification: {"playbook": "deep_research", "analysis": "I need to retrieve optimization techniques across multiple dimensions: index design and optimization, SQL query rewriting, connection pooling, caching strategies, database parameter tuning, and hardware resource planning for a comprehensive solution.", "reason": "Question spans multiple optimization dimensions requiring full coverage"}

**Negative Example** (DO NOT follow this style)
Question: "What is the default password for the xxx product?"
Bad: {"playbook": "simple_query", "analysis": "The user needs to get the default password of the xxx product. The question is clear and direct, and the expected answer is a specific password value.", "reason": "..."}
→ Wrong: analysis only describes the question, not the retrieval action.

Corrected: {"playbook": "simple_query", "analysis": "I need to retrieve the default administrator account password from the official documentation or installation manual of the xxx product.", "reason": "Single factual query asking for a specific default password value with clear intent, no multi-dimensional analysis or troubleshooting needed"}`;

  return `You are a question classifier. Analyze the user's intent and select the most appropriate playbook with reason.

## Available Playbooks:
${playbookDescriptions}

## Context (optional hints for Search):
${priorContext || 'No additional context'}

## Chat History Context:
${summaryStr}

${previousPlaybooksSection}

${entitiesSection}

## User Question:
${question}

## Decision Guidelines:

### Choose **followup_query** when:
- Question follows previous conversation
- Contains words like: "then", "next", "also", "what about", "how about", "那", "那么", "还有"
- Uses pronouns: "it", "this", "that", "它", "这个", "那个"
- Asks for clarification or expansion on previous topic
- **Analysis should**: identify what specific aspect from previous context needs to be retrieved or expanded, and how it connects to prior discussion. MUST describe the retrieval action, NOT merely describe the question.

### Choose **simple_query** when:
- Single, focused factual question
- Clear intent, straightforward answer expected
- Examples: "What is X?", "How to configure Y?", "What is the default password?"
- **Analysis should**: identify the exact factual information to retrieve and its source (e.g., official docs, configuration files, product manuals). MUST describe the retrieval action, NOT merely describe the question.

### Choose **deep_research** when:
- Needs complete listing of ALL items (versions, features, products, etc.)
- Needs multiple aspects/dimensions coverage
- Query contains: "有哪些", "all", "list", "every", "complete", "history", "versions"
- Examples: "What versions does HCI have?", "List all security features", "What are all the products?"
- **Analysis should**: enumerate all dimensions or categories that need to be retrieved to provide a comprehensive answer. MUST describe the retrieval action, NOT merely describe the question.

### Choose **troubleshooting** when:
- Error fixing, debugging, problem solving
- Contains: "error", "fail", "not working", "broken", "fix"
- **Analysis should**: identify the symptom, list possible root causes to investigate, and outline the diagnostic or resolution steps to retrieve. MUST describe the retrieval action, NOT merely describe the question.

### Choose **comparative_analysis** when:
- Comparing multiple objects
- Contains: "compare", "vs", "versus", "difference", "advantage", "disadvantage"
- **Analysis should**: identify the objects being compared and the specific dimensions to retrieve for each object, then how to contrast them. MUST describe the retrieval action, NOT merely describe the question.
${fewShotExamples}

## Output Format (JSON, one line, no extra text):
Separate result into "playbook", intent "analysis", choose "reason".

CRITICAL RULES for "analysis":
- MUST start with "我需要检索..." or "I need to retrieve/look up..."
- MUST describe the retrieval action and source, NOT the question content
- MUST NOT contain phrases like "用户在问..." / "The user is asking..."
- MUST NOT merely restate or summarize the question
- The analysis must not include question type / reason.

{"playbook": "Selected playbook name", "analysis": "MUST be written in ${lang}", "reason": "Why this playbook — MUST be written in ${lang}"}`;
}
