// src/agent/playbooks/templates.ts
// Playbook 模板定义 - 完整版（6 种 playbook）

/**
 * Playbook 定义
 */
export interface PlaybookDef {
  name: string;
  description: string;
  detail: string; // answer 模式
  detailSearchOnly: string; // searchOnly 模式
}

// ============================================================
// 6 种 Playbook 详细定义
// ============================================================

/**
 * Simple Query - 直接事实查询
 */
export const SIMPLE_QUERY_DETAIL = `## Scenario Guidance: Direct Query

This question is focused and clear — a direct search should retrieve the answer.

**MUST follow these steps:**
1. STOP. You MUST use @search to retrieve information before answering.
2. Search the original query directly.
3. **If your search returned a directly relevant result (you can see the answer clearly) → call @summary IMMEDIATELY. Do NOT call @assess.**
4. If the first search returned poor or no results: use @query_rewrite ONCE to rephrase, then search again.
5. Do NOT answer from memory or make up information.

**Output Rule:**
- You MUST use @summary tool to generate final response (do NOT write answer yourself).
- Keep the answer focused — do not over-elaborate for simple facts.
- Do NOT use @assess — it is not needed for direct queries.`;

/**
 * Comparative Analysis - 对比分析查询
 */
export const COMPARATIVE_ANALYSIS_DETAIL = `## Scenario Guidance: Comparison Query (Comparative Analysis)

This question involves comparing multiple objects (e.g., A vs B vs C). Each object needs \
separate information before a synthesis is possible.

### Two-Phase Execution

**Phase 1: Discovery (探索阶段)**
- Objective: Confirm all comparison objects exist in knowledge base, discover comparison dimensions
- First, use @query_rewrite(strategies="decompose") to identify comparison objects
- Then search each object with a basic query (e.g., "What is product A", "What is product B")
- From the search results, automatically extract comparison dimensions:
  - If user explicitly mentions dimensions (e.g., "feature differences", "architecture differences") → use those
  - Otherwise, infer dimensions from results: definition, features, architecture, use cases, pricing, performance, limitations, etc.

**Phase 2: Enrichment (深度阶段)**
- After dimensions are discovered, decompose by dimension: "product A features", "product B features", "product A architecture", "product B architecture"
- Search each dimension separately. Use parallel search when possible.
- Continue until all dimensions have been searched at least once

**Optional — @assess for chunk annotation and progress tracking:**
After each search round, you MAY call @assess to:
- Record key findings from the current round
- Update the list of missing information (lacks)
- Annotate the most useful chunks (key_chunks) for preservation in the final answer
- Mark when information is sufficient (sufficient: true)
This is especially useful for tracking multi-dimensional comparison progress.

**Output Rule:**
- You MUST use @summary tool to generate final response.
- Structure the answer with a comparison table or parallel bullet points.
- Present both similarities and differences clearly.`;

/**
 * Troubleshooting - 故障排查查询
 */
export const TROUBLESHOOTING_DETAIL = `## Scenario Guidance: Depth-First Query (Troubleshooting)

This is a diagnostic scenario. Each search step may depend on results from the previous one.

**MUST follow these steps:**
1. STOP. Do NOT answer directly — you need troubleshooting information.
2. Use @search to find the error message or symptom keywords.
3. Evaluate results:
   - Found troubleshooting docs → use @summary with structured diagnosis.
   - Insufficient → use @query_rewrite (try par or gqr strategy) and search again.
   - Multiple possible causes → search each cause's solution separately.
4. Answer structure: Symptom → Possible causes → Diagnostic steps → Solutions.
5. If information is insufficient, list known clues and suggest user provide more details.

**Optional — @assess for chunk annotation:**
You MAY call @assess to annotate chunks containing key diagnostic steps or solutions (key_chunks).
Call @summary when you have the main diagnostic information — you do not need exhaustive coverage.

**Output Rule:**
- You MUST use @summary tool to generate final response.
- Structure: Symptom → Possible causes → Diagnostic steps → Solutions`;

/**
 * Deep Research - 深度研究查询
 */
export const DEEP_RESEARCH_DETAIL = `## Scenario Guidance: Comprehensive Query (Deep Research)

This question requires comprehensive, multi-angle analysis or complete listing.

**MUST follow these steps:**
1. STOP. Do NOT answer directly — you need comprehensive research.
2. Use @query_rewrite(strategies="decompose") to break the research question into sub-questions.
3. Search ONLY the sub-questions returned by @query_rewrite using parallel @search. Do NOT add extra ad-hoc queries beyond what @query_rewrite returned.
4. Assess coverage: which sub-questions still lack information?
5. For under-covered sub-questions, use @query_rewrite ONCE more to rephrase, then search again.
6. When you have covered the main aspects, call @summary immediately with clear section structure.

**Optional — @assess for chunk annotation:**
After searching, you MAY call @assess to annotate the most valuable chunks (key_chunks).
This helps preserve critical information in the final answer.
You do NOT need to fill every lack before answering — call @summary with what you have.

**Output Rule:**
- You MUST use @summary tool to generate final response.
- Do NOT answer from memory — base everything on retrieved information.
- Ensure complete coverage of all items/aspects requested.`;

/**
 * Follow-up Query - 追问
 */
export const FOLLOWUP_QUERY_DETAIL = `## Scenario Guidance: Follow-up Query

This is a continuation of a previous conversation. The question references prior context.

**MUST follow these steps:**
1. Review the chat history to understand what was discussed.
2. Identify what additional information is being asked.
3. If the follow-up is about a specific item mentioned before, search for that specific item.
4. If asking for clarification or expansion, search for more details on the topic.

**Output Rule:**
- You MUST use @summary tool to generate final response.
- Keep answer connected to previous context.
- If answering based on prior conversation, explicitly reference it.`;

/**
 * General - 通用查询
 */
export const GENERAL_DETAIL = `## Scenario Guidance: General Query

This is a general query that doesn't fit specific categories.

**MUST follow these steps:**
1. Analyze the question to understand the intent.
2. Use @search to find relevant information.
3. If results are insufficient, use @query_rewrite to try different formulations.
4. Synthesize information from multiple sources if available.

**Output Rule:**
- You MUST use @summary tool to generate final response.
- Follow standard answer quality guidelines.
- Include relevant citations from retrieved chunks.`;

// ============================================================
// SearchOnly 变体（6 种 playbook × searchOnly 模式）
// ============================================================

/**
 * Simple Query - searchOnly 模式
 */
export const SIMPLE_QUERY_DETAIL_SEARCH_ONLY = `## Scenario Guidance: Direct Query (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY and DIRECTLY answer the user's question → STOP. Call no tools.
- If the hints are an alias/synonym mapping (e.g. "alias: A=B") → use both terms in your search queries, then proceed.
- If the hints are partial or supplementary → incorporate them into your search, then proceed.

**Search Steps:**
1. Search the original query directly (using any aliases or synonyms from hints).
2. If the first search returned poor or no results: use @query_rewrite ONCE to rephrase, then search again.
3. Do NOT search more than twice.

**Stop Rule:**
- When you have completed your searches, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

/**
 * Comparative Analysis - searchOnly 模式
 */
export const COMPARATIVE_ANALYSIS_DETAIL_SEARCH_ONLY = `## Scenario Guidance: Comparison Query (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY answer the comparison question → STOP. Call no tools.
- If the hints provide alias mappings or supplementary context → use them to guide searches.

**Phase 1: Discovery**
- Use @query_rewrite(strategies="decompose") to identify comparison objects and dimensions.
- Search each comparison object with a basic query.

**Phase 2: Enrichment**
- Search each object × dimension combination.
- Use parallel search (@search with JSON array) when queries are independent.
- Continue until all identified dimensions have been searched at least once.

**Stop Rule:**
- When main dimensions are covered, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

/**
 * Troubleshooting - searchOnly 模式
 */
export const TROUBLESHOOTING_DETAIL_SEARCH_ONLY = `## Scenario Guidance: Troubleshooting (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY answer the troubleshooting question → STOP. Call no tools.
- If the hints provide supplementary context → incorporate into searches.

**Search Steps:**
1. Search the error message or symptom keywords.
2. If insufficient: use @query_rewrite (try par or gqr strategy), then search again.
3. If multiple possible causes are found: search each cause's solution separately.

**Stop Rule:**
- When main diagnostic information is found, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

/**
 * Deep Research - searchOnly 模式
 */
export const DEEP_RESEARCH_DETAIL_SEARCH_ONLY = `## Scenario Guidance: Comprehensive Query (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY enumerate the items requested → STOP. Call no tools.
- If the hints provide alias mappings or partial lists → use them to guide searches.

**Search Steps:**
1. Use @query_rewrite(strategies="decompose") to break the question into sub-questions.
2. Search ONLY the sub-questions returned by @query_rewrite (parallel when possible).
3. Assess coverage: which sub-questions still lack information?
4. For under-covered sub-questions: use @query_rewrite ONCE more to rephrase, then search again.

**Stop Rule:**
- When main aspects are covered, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

/**
 * Follow-up Query - searchOnly 模式
 */
export const FOLLOWUP_QUERY_DETAIL_SEARCH_ONLY = `## Scenario Guidance: Follow-up Query (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY answer the follow-up question → STOP. Call no tools.
- If the hints are supplementary → use them to guide searches.

**Search Steps:**
1. Review chat history to identify what is being asked.
2. Search for the specific item or topic being followed up on.
3. If results are insufficient: use @query_rewrite ONCE, then search again.

**Stop Rule:**
- When the target information is found, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

/**
 * General - searchOnly 模式
 */
export const GENERAL_DETAIL_SEARCH_ONLY = `## Scenario Guidance: General Query (Search-Only)

**Step 0 — Priority Check (Execute First):**
Review the Search Hints provided.
- If the hints COMPLETELY answer the question → STOP. Call no tools.
- If the hints are supplementary or alias mappings → use them to guide searches.

**Search Steps:**
1. Search the original query (incorporating any alias hints).
2. If results are insufficient: use @query_rewrite to rephrase, then search again.

**Stop Rule:**
- When sufficient chunks are collected, make no more tool calls. Simply stop.
- Do NOT call @summary.`;

// ============================================================
// Playbook 注册表
// ============================================================

export const PLAYBOOKS: Record<string, PlaybookDef> = {
  simple_query: {
    name: 'simple_query',
    description: 'Direct factual query with clear intent. Single answer expected.',
    detail: SIMPLE_QUERY_DETAIL,
    detailSearchOnly: SIMPLE_QUERY_DETAIL_SEARCH_ONLY
  },
  comparative_analysis: {
    name: 'comparative_analysis',
    description: 'Compare multiple objects. Analyze differences and similarities.',
    detail: COMPARATIVE_ANALYSIS_DETAIL,
    detailSearchOnly: COMPARATIVE_ANALYSIS_DETAIL_SEARCH_ONLY
  },
  troubleshooting: {
    name: 'troubleshooting',
    description: 'Debug errors, fix problems, resolve issues.',
    detail: TROUBLESHOOTING_DETAIL,
    detailSearchOnly: TROUBLESHOOTING_DETAIL_SEARCH_ONLY
  },
  deep_research: {
    name: 'deep_research',
    description: 'Comprehensive coverage needed. List all items, multiple aspects.',
    detail: DEEP_RESEARCH_DETAIL,
    detailSearchOnly: DEEP_RESEARCH_DETAIL_SEARCH_ONLY
  },
  followup_query: {
    name: 'followup_query',
    description: 'Continuation of previous conversation. Clarify or expand.',
    detail: FOLLOWUP_QUERY_DETAIL,
    detailSearchOnly: FOLLOWUP_QUERY_DETAIL_SEARCH_ONLY
  },
  general: {
    name: 'general',
    description: 'General query requiring analysis first.',
    detail: GENERAL_DETAIL,
    detailSearchOnly: GENERAL_DETAIL_SEARCH_ONLY
  }
};

/**
 * 获取 playbook 内容
 */
export function getPlaybookContent(playbookName: string, searchOnly?: boolean): string {
  const playbook = PLAYBOOKS[playbookName] || PLAYBOOKS.general;
  return searchOnly ? playbook.detailSearchOnly : playbook.detail;
}

/**
 * 获取所有 playbook 名称
 */
export function getAllPlaybookNames(): string[] {
  return Object.keys(PLAYBOOKS);
}
