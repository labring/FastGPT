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

  const fewShotExamples = `
## Few-shot Examples
**KEY RULE**: The analysis and reason are ALWAYS written in the SAME language as the user's question.
The examples below demonstrate this pattern across 5 languages.

**Example 1** (Chinese - zh)
Question: "云端部署和本地部署有什么区别？"
Classification: {"playbook": "comparative_analysis", "analysis": "我需要分别检索云端部署和本地部署在架构设计、运维成本、数据安全性、扩展性、网络依赖等维度的信息，然后逐项对比差异。", "reason": "包含关键词'区别'"}

**Example 2** (English - en)
Question: "What operating systems does this product support?"
Classification: {"playbook": "deep_research", "analysis": "I need to retrieve all supported operating system versions across platforms (Windows, Linux, macOS) including minimum requirements and recommended configurations.", "reason": "Contains keyword 'what'"}

**Example 3** (Japanese - ja)
Question: "ログインできない場合のトラブルシューティング方法は？"
Classification: {"playbook": "troubleshooting", "analysis": "認証エラー、ネットワーク接続の問題、アカウントロック、セッションタイムアウトなど、一般的なログイン失敗の原因を検索し、体系的な診断手順にまとめる必要がある。", "reason": "「できない」と「トラブルシューティング」というキーワードを含む"}

**Example 4** (Thai - th)
Question: "รหัสผ่านเริ่มต้นของ HCI คืออะไร"
Classification: {"playbook": "simple_query", "analysis": "ฉันต้องค้นหาเอกสารอย่างเป็นทางการหรือคู่มือการติดตั้งของ HCI เพื่อดึงรหัสผ่านผู้ดูแลระบบเริ่มต้น", "reason": "คำถามข้อเท็จจริงเดียว ถามเกี่ยวกับค่ารหัสผ่านเริ่มต้นที่เฉพาะเจาะจง"}

**Example 5** (Korean - ko)
Question: "데이터베이스 쿼리 성능을 어떻게 최적화하나요?"
Classification: {"playbook": "deep_research", "analysis": "인덱스 설계 및 최적화, SQL 쿼리 재작성, 연결 풀링, 캐싱 전략, 데이터베이스 매개변수 튜닝, 하드웨어 리소스 계획 등 여러 차원의 최적화 기술을 검색하여 포괄적인 솔루션을 제공해야 한다.", "reason": "질문이 여러 최적화 차원에 걸쳐 있으며 전체적인 적용 범위가 필요함"}

**Negative Example** (DO NOT follow — analysis describes the question instead of retrieval action)
Question: "某产品的默认密码是什么？"
Bad: {"playbook": "simple_query", "analysis": "用户需要获取某产品默认密码这一具体事实信息。问题明确直接，预期答案是具体的密码值。", "reason": "..."}
→ WRONG: analysis only describes the question, not the retrieval action.
Corrected: {"playbook": "simple_query", "analysis": "我需要检索某产品的官方文档或安装手册中关于默认管理员账户密码的说明，直接提取初始登录凭证。", "reason": "单一事实性查询，询问具体的默认密码值，意图明确，无需多维度分析或问题排查"}
`;
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
- MUST describe the retrieval action and source, NOT the question content
- MUST NOT contain phrases like "用户在问..." / "The user is asking..."
- MUST NOT merely restate or summarize the question
- The analysis must not include question type / reason.

{"playbook": "Selected playbook name", "analysis": "MUST be written in ${lang}", "reason": "Why this playbook — MUST be written in ${lang}"}`;
}
