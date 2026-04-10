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

/**
 * 构建 Classifier Prompt
 */
export interface BuildClassifierPromptOptions {
  playbookDescriptions: string;
  priorContext: string;
  summary: string;
  question: string;
  lang: string;
}

/**
 * 构建分类器 prompt
 */
export function buildClassifierPrompt(options: BuildClassifierPromptOptions): string {
  const { playbookDescriptions, priorContext, summary, question, lang } = options;

  const previousPlaybooksSection =
    summary !== 'No additional chat_history'
      ? `## Previous Question Types:\n- (from chat history)`
      : '## Previous Question Types:\nNone';

  const entitiesSection =
    summary !== 'No additional chat_history'
      ? `## Key Entities from History:\n- (from chat history)`
      : '## Key Entities from History:\nNone';

  return `You are a question classifier. Analyze the user's question and select the most appropriate playbook.

## Available Playbooks:
${playbookDescriptions}

## Context (optional hints for Search):
${priorContext || 'No additional context'}

## Chat History Context:
${summary}

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

### Choose **simple_query** when:
- Single, focused factual question
- Clear intent, straightforward answer expected
- Examples: "What is X?", "How to configure Y?", "What is the default password?"

### Choose **deep_research** when:
- Needs complete listing of ALL items (versions, features, products, etc.)
- Needs multiple aspects/dimensions coverage
- Query contains: "有哪些", "all", "list", "every", "complete", "history", "versions"
- Examples: "What versions does HCI have?", "List all security features", "What are all the products?"

### Choose **troubleshooting** when:
- Error fixing, debugging, problem solving
- Contains: "error", "fail", "not working", "broken", "fix"

### Choose **comparative_analysis** when:
- Comparing multiple objects
- Contains: "compare", "vs", "versus", "difference", "advantage", "disadvantage"

## Output Format (JSON):
{"analysis": "Brief analysis for User's Intention — MUST be written in ${lang}", "reason": "Why this playbook is selected — MUST be written in ${lang}", "playbook": "Selected playbook name"}`;
}
