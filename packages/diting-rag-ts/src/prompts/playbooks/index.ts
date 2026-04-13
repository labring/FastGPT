// src/prompts/playbooks/index.ts
// Playbook 提示词定义

import {
  RERANKER_SUB_QUERY_PROMPT,
  RERANKER_GENERAL_PROMPT,
  RERANKER_SIMPLE_PROMPT,
  RERANKER_COMPARISON_PROMPT,
  RERANKER_TROUBLESHOOTING_PROMPT,
  RERANKER_DEEP_RESEARCH_PROMPT,
  RERANKER_FOLLOWUP_PROMPT
} from '../atomic/chunk_selector_prompts';

export interface PlaybookDef {
  name: string;
  description: string;
  detail: string;
}

/**
 * Playbook 定义
 */
export const playbooks: Record<string, PlaybookDef> = {
  simple_query: {
    name: 'simple_query',
    description:
      'Direct factual query with clear intent. Single answer expected. Use when question is specific and focused.',
    detail: `## Scenario Guidance: Direct Query

This question is focused and clear — a direct search should retrieve the answer.

**MUST follow these steps:**
1. STOP. You MUST use @search to retrieve information before answering.
2. Search the original query directly.
3. **If your search returned a directly relevant result (you can see the answer clearly) → call @answer IMMEDIATELY. Do NOT call @assess.**
4. If the first search returned poor or no results: use @query_rewrite ONCE to rephrase, then search again.
5. Do NOT answer from memory or make up information.

**Output Rule:**
- You MUST use @answer tool to generate final response (do NOT write answer yourself).
- Keep the answer focused — do not over-elaborate for simple facts.
- Do NOT use @assess — it is not needed for direct queries.`
  },

  comparative_analysis: {
    name: 'comparative_analysis',
    description:
      'Compare multiple objects. Analyze differences and similarities. Use when question involves comparing A vs B.',
    detail: `## Scenario Guidance: Comparison Query (Comparative Analysis)

This question involves comparing multiple objects (e.g., A vs B vs C). Each object needs \
separate information before a synthesis is possible.

### Two-Phase Execution

**Phase 1: Discovery (探索阶段)**
- Objective: Confirm all comparison objects exist in knowledge base, discover comparison dimensions
- First, use @query_rewrite(strategies="decompose") to identify comparison objects
- Then search each object with a basic query (e.g., "What is product A", "What is product B")
- From the search results, automatically extract comparison dimensions:
  - If user explicitly mentions dimensions (e.g., "feature differences", "architecture differences") → use those
  - Otherwise, infer dimensions from results: definition, features, architecture, \
    use cases, pricing, performance, limitations, etc.

**Phase 2: Enrichment (深度阶段)**
- After dimensions are discovered, decompose by dimension: "product A features", "product B features", "product A architecture", "product B architecture"
- Search each dimension separately. Use parallel search when possible.
- Continue until all dimensions have been searched at least once

### Handling Different Scenarios

1. **User provides explicit dimensions** (e.g., "What are the feature differences between A and B?"):
   → Skip discovery phase, directly search "A features", "B features"

2. **User provides NO explicit dimensions** (e.g., "What are the differences between A, B, and C?"):
   → Must go through discovery phase to discover dimensions first

3. **Some objects not found in knowledge base**:
   → If an object returns no relevant results, note it and inform user in final answer

### Termination Criteria

DO NOT stop just because you have "enough" chunks. Continue until:
- All discovered dimensions have been searched at least once
- AND either: (a) search budget exhausted, OR (b) consecutive 2 searches have low info gain

**Critical**: A dimension is "covered" only after you've searched it, not after you have N chunks.

### Progressive Assessment (After Each @search)

**Optionally, call @assess to annotate chunks with critical comparison data:**
- key_chunks: chunks containing key comparison facts
- findings/lacks: recorded in blackboard for context, but do NOT require exhaustive coverage
- You do NOT need to fill every lack before calling @answer

### Output Rule:
- You MUST use @answer tool to generate final response
- Structure the comparison as a table or organized sections by dimension
- Clearly state if any object was not found in knowledge base
- Do NOT answer from memory or make up comparison details`
  },

  troubleshooting: {
    name: 'troubleshooting',
    description:
      'Debug errors, fix problems, resolve issues. Use when question involves errors, failures, or troubleshooting.',
    detail: `## Scenario Guidance: Depth-First Query (Troubleshooting)

This is a diagnostic scenario. Each search step may depend on results from the previous one.

**MUST follow these steps:**
1. STOP. Do NOT answer directly — you need troubleshooting information.
2. Use @search to find the error message or symptom keywords.
3. Evaluate results:
   - Found troubleshooting docs → use @answer with structured diagnosis.
   - Insufficient → use @query_rewrite (try par or gqr strategy) and search again.
   - Multiple possible causes → search each cause's solution separately.
4. Answer structure: Symptom → Possible causes → Diagnostic steps → Solutions.
5. If information is insufficient, list known clues and suggest user provide more details.

**Optional — @assess for chunk annotation:**
You MAY call @assess to annotate chunks containing key diagnostic steps or solutions (key_chunks).
Answer when you have the main diagnostic information — you do not need exhaustive coverage.

**Output Rule:**
- You MUST use @answer tool to generate final response.
- Do NOT answer from memory or guess solutions.`
  },

  deep_research: {
    name: 'deep_research',
    description:
      'Comprehensive coverage needed. List all items, multiple aspects. Use when question needs complete listing (versions, features, products) or multi-dimension analysis.',
    detail: `## Scenario Guidance: Comprehensive Query (Deep Research)

This question requires comprehensive, multi-angle analysis or complete listing.

**MUST follow these steps:**
1. STOP. Do NOT answer directly — you need comprehensive research.
2. Use @query_rewrite(strategies="decompose") to break the research question into sub-questions.
3. Search ONLY the sub-questions returned by @query_rewrite using parallel @search. Do NOT add extra ad-hoc queries beyond what @query_rewrite returned.
4. Assess coverage: which sub-questions still lack information?
5. For under-covered sub-questions, use @query_rewrite ONCE more to rephrase, then search again.
6. When you have covered the main aspects, call @answer immediately with clear section structure.

**Optional — @assess for chunk annotation:**
After searching, you MAY call @assess to annotate the most valuable chunks (key_chunks).
This helps preserve critical information in the final answer.
You do NOT need to fill every lack before answering — answer with what you have.

**Output Rule:**
- You MUST use @answer tool to generate final response.
- Do NOT answer from memory — base everything on retrieved information.
- Ensure complete coverage of all items/aspects requested.`
  },

  followup_query: {
    name: 'followup_query',
    description:
      'Continuation of previous conversation. Clarify, refine, or expand on prior answer. Use when question refers to previous context.',
    detail: `## Scenario Guidance: Follow-up Query

This is a follow-up question based on conversation history — user wants to \
refine, reformat, clarify, or expand on the previous answer.

**When to use this playbook:**
- User asks to reformat (table, concise, bullet points)
- User asks for more details or clarification
- User asks "why", "how", "what about X"
- User uses pronouns: "it", "this", "that", "these"
- User references previous context: "before mentioned", "earlier"

**MUST follow these steps:**
1. STOP. Review conversation history and previous answer/chunks first.
2. Check what has been searched before (avoid duplicate searches):
   - Review ctx.search_queries for previous successful searches
   - Review ctx.all_chunks for previously retrieved content
3. Decide: does this need a new @search?
   - Format-only request (table, concise, bullet points) → NO search needed
   - New information request → use @search (but avoid duplicate queries)
   - Clarification on existing content → use previous chunks or @query_rewrite
4. If reusing previous chunks, cite them properly.
5. Use @answer to generate the refined response.

**Output Rule:**
- You MUST use @answer tool to generate final response.
- If no new search needed, pass previous chunks to @answer for reformatting.
- Always cite sources from current or previous turns.`
  },

  general: {
    name: 'general',
    description:
      "General query requiring analysis first. Use when the question doesn't fit other specific categories.",
    detail: `## Scenario Guidance: Analyze First

Analyze the question structure to determine the query type \
(Direct / Depth-First / Breadth-First / Compound), then plan your search accordingly.

**MUST follow these steps:**
1. STOP. Do NOT answer directly.
2. Use @search to get initial results.
3. Based on result quality and question complexity, decide next steps.
4. Use @query_rewrite flexibly to explore different search angles.
5. When sufficient information is collected, use @answer to generate response.

**Output Rule:**
- You MUST use @answer tool to generate final response.
- Do NOT write answer yourself — always use @answer tool.`
  }
};

/**
 * Router 规则
 */
export interface RouterRule {
  playbook: string;
  triggers: string[];
  anti_triggers: string[];
}

export const routerRules: RouterRule[] = [
  {
    playbook: 'simple_query',
    triggers: ['是什么', '怎么', '如何', '多少', '什么', 'what', 'how', 'why'],
    anti_triggers: []
  },
  {
    playbook: 'troubleshooting',
    triggers: ['error', 'fail', 'not working', 'fix', '解决', '报错', '故障'],
    anti_triggers: []
  },
  {
    playbook: 'comparative_analysis',
    triggers: ['compare', 'vs', 'versus', 'difference', '对比', '区别', '比较'],
    anti_triggers: []
  },
  {
    playbook: 'deep_research',
    triggers: ['有哪些', 'all', 'list', 'every', '所有', '全部', '哪些'],
    anti_triggers: []
  },
  {
    playbook: 'followup_query',
    triggers: ['then', 'next', 'also', 'what about', 'how about', '那', '那么', '还有'],
    anti_triggers: []
  }
];

/**
 * Chunk Selector prompts（对齐 Python chunk_selector_prompts.py）
 * Stage 1: sub-query filter prompt
 * Stage 2: playbook-aware prompts
 */
export const chunkSelectorPrompts: Record<string, { stage1: string; stage2: string }> = {
  general: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_GENERAL_PROMPT
  },
  simple_query: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_SIMPLE_PROMPT
  },
  comparative_analysis: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_COMPARISON_PROMPT
  },
  troubleshooting: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_TROUBLESHOOTING_PROMPT
  },
  deep_research: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_DEEP_RESEARCH_PROMPT
  },
  followup_query: {
    stage1: RERANKER_SUB_QUERY_PROMPT,
    stage2: RERANKER_FOLLOWUP_PROMPT
  }
};
