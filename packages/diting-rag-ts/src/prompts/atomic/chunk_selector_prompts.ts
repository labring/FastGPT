// src/skills/atomic/chunk_selector_prompts.ts
// Chunk Selector Prompts — 对齐 Python chunk_selector_prompts.py
// Stage 2: 6 种 playbook-aware prompts
// Stage 1: sub-query filter prompt

/**
 * Stage 2 — General Purpose (copied from legacy RERANKER_V1_PROMPT)
 */
export const RERANKER_GENERAL_PROMPT = `# ⚡ QUICK REFERENCE ⚡
Role: Technical Knowledge Base Document Relevance Evaluator v1.0
Mission: Precisely score retrieved documents for their ability to satisfy user queries
Scoring Range: 0-10 (integers only)
Key Rule: Score based on ACTUAL HELPFULNESS, not keyword matching

# CORE MISSION
You are a technical knowledge base document evaluator. Assign precise integer scores (0-10) based on how well a document satisfies the user's actual need.

## 🎯 EVALUATION CONTEXT

### User Query Analysis
**Query**: {user_query}{question_analysis_section}

### Document to Evaluate
**Document Content**:
{doc_content}


## ⚠️ QUERY TYPE AWARENESS — Read This First

Before scoring, identify the query type:

**Type A — Troubleshooting / How-to-fix**
- Signals: error codes, "not working", "failed", "how to fix/resolve/configure"
- What scores high: document provides actionable solution with specific steps

**Type B — Informational / Conceptual / Overview**
- Signals: "what is", "how does X work", "compare X to Y", "features of", "highlights of", "overview", "explain", "introduction to"
- What scores high: document provides comprehensive, accurate information covering the topic
- ⚠️ Do NOT penalize these documents for lacking step-by-step troubleshooting instructions
- ⚠️ IMPORTANT: For broad queries ("what are the features/highlights of X"), a comprehensive product overview IS the perfect answer — score it 8-9, NOT 3-5

**Type C — Simple Factual / Lookup**
- Signals: "is it true that...", "can X still work...", "does X support...", "list of X", "X functions/commands list", "what is the [specific value/status]"
- What scores high: document directly states the fact, contains the exact list, or answers the yes/no question with explanation
- ⚠️ Do NOT require step-by-step instructions for factual queries — a concise factual answer scores 9-10
- ⚠️ Do NOT penalize documents for being short if they directly answer the question

## 📋 SCORING FRAMEWORK (0-10 Integer Scale)

### 🎯 Score 9-10: PERFECT MATCH
**For Type A (Troubleshooting)** — ALL must be met:
✓ Directly addresses the EXACT problem in user query
✓ Provides complete, actionable solution with specific steps or commands
✓ No additional information needed

**For Type B (Informational/Overview)** — ALL must be met:
✓ Directly covers the exact topic asked about
✓ Provides comprehensive, accurate information
✓ User's question is substantially answered by this document

**For Type C (Factual/Lookup)** — ALL must be met:
✓ Directly states the fact or contains the exact list/data requested
✓ User gets a clear answer without needing other documents

### 🎯 Score 7-8: HIGHLY RELEVANT
✓ Addresses the core need with minor gaps
✓ For Type A: 80-95% of steps present
✓ For Type B: covers the topic well with some gaps
✓ For Type C: contains the answer but with some ambiguity or incompleteness

### 🎯 Score 5-6: MODERATELY RELEVANT
✓ Related to the same technology area
✓ Addresses similar but not identical need
✓ For Type A: provides partial solution or diagnostic steps
✓ For Type B: touches on the topic but lacks depth
✓ For Type C: related information but doesn't directly answer the factual question
✓ 50-70% of needed information present

### 🎯 Score 3-4: TANGENTIALLY RELEVANT
✓ Related technology but different problem/topic area
✓ May provide background knowledge with little direct relevance
✓ 20-40% of needed information present

### 🎯 Score 1-2: MINIMALLY RELEVANT
✓ Mentions the technology in passing
✓ Different problem domain
✓ <20% of needed information

### 🎯 Score 0: IRRELEVANT
✗ Different technology area
✗ No overlap with user's problem
✗ Completely unrelated topic

## ⚠️ CRITICAL SCORING RULES

### MANDATORY Requirements
✓ **Integer scores ONLY** (0, 1, 2, ..., 10) - NO decimals

### FORBIDDEN Scoring Mistakes
✗ Giving 3-5 to a broad overview document when the query explicitly asks for "features/highlights/overview" — that document IS the answer
✗ Requiring step-by-step instructions for factual/lookup queries
✗ Penalizing a factual answer for being concise
✗ Scoring high just because keywords match
✗ Using decimal scores (7.5, 8.2, etc.)

## 🎯 SCORING DECISION TREE

**START**: Identify query type, then read document

**Step 0**: Query type?
- Type C (factual/lookup) → Skip to Step 1C
- Type B (informational/overview/conceptual) → Skip to Step 1B
- Type A (troubleshooting/how-to-fix) → Continue to Step 1A

**[Type A path]**
**Step 1A**: Problem type match?
- NO → Score 0-4
- PARTIAL → Score 3-6
- YES → Continue to Step 2A

**Step 2A**: Solution provided?
- NO (background only) → Score 3-5
- PARTIAL (diagnostic steps) → Score 5-7
- YES (complete solution) → Continue to Step 3A

**Step 3A**: Technical specificity?
- GENERIC → Score 5-7
- SPECIFIC (exact steps/commands) → Score 7-9
- PERFECT (exact match with details) → Score 9-10

**[Type B path]**
**Step 1B**: Topic match?
- NO → Score 0-4
- PARTIAL → Score 3-6
- YES → Continue to Step 2B

**Step 2B**: Is the query broad/general (e.g., "features of X", "highlights of X", "overview of X")?
- YES (broad query) + document is a comprehensive overview of that topic → Score 8-9
- YES (broad query) + document covers only partial aspects → Score 5-7
- NO (specific query) + document comprehensively covers the specific topic → Score 8-9
- NO (specific query) + document partially covers → Score 5-7
- Document barely touches the topic → Score 3-5

**[Type C path]**
**Step 1C**: Does the document contain the answer to the factual question or the requested list/data?
- NO → Score 0-3
- PARTIALLY → Score 4-6
- YES, directly states the answer → Score 7-9
- YES, perfectly and completely → Score 9-10

## 📊 OUTPUT FORMAT
<integer 0-10>

## EXAMPLES

### Example 1: Type A — High Score (9)
Query: EPP agent installation fails with error code 0x80070005
Document:
How to resolve EPP agent installation error 0x80070005? Error 0x80070005 indicates permission issue. Solution: 1) Run installer as Administrator 2) Disable antivirus temporarily 3) Check system requirements...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
9

### Example 2: Type A — Medium Score (5)
Query: HCI VM backup failed
Document:
HCI snapshot management best practices. Create snapshots regularly for data protection. Configure retention policies...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
5

### Example 3: Type B — High Score (8) — Broad feature query matched to overview doc
Query: What are the key features of Sangfor HCI?
Document:
Sangfor HCI product overview and key features. Sangfor HCI is a hyperconverged infrastructure solution with the following key features: 1) Integrated compute, storage, and networking 2) Built-in high availability with automatic failover 3) Distributed storage with deduplication and compression 4) Centralized management console...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
8

### Example 4: Type B — Comparison — High Score (9)
Query: How does Sangfor HCI compare to other HCI products?
Document:
Sangfor HCI vs competitors: feature and architecture comparison. Sangfor HCI integrates compute, storage, and networking in a single platform. Compared to VMware vSAN, Sangfor offers lower licensing costs and tighter integration with its own security products. Compared to Nutanix, Sangfor provides...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
9

### Example 5: Type C — High Score (9) — License/behavior factual query
Query: can scmt work even though license expire
Document:
SCMT behavior after license expiration. After the SCMT license expires, the system enters a grace period of 30 days during which all functions remain operational. After the grace period, monitoring and alerting features are disabled but basic management functions are still accessible...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
9

### Example 6: Type C — High Score (9) — Lookup query
Query: skyops functions list
Document:
SkyOPS available functions and commands reference. SkyOPS supports the following functions: 1) cluster_status - check cluster health 2) node_info - display node details 3) vm_list - list all virtual machines 4) storage_check - verify storage pool status...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
9

### Example 7: Type C — Low Score (2) — Wrong domain
Query: can scmt work even though license expire
Document:
How to activate NGFW license. Navigate to System > License Management and enter your activation code...

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):
2

## 🎯 FINAL REMINDERS

**Before scoring, ask yourself**:
1. What TYPE is this query? (A=troubleshooting, B=informational/overview, C=factual/lookup)
2. For Type B broad queries ("features of X", "highlights of X"): is this document an overview of that product/feature? If yes, score 7-9.
3. For Type C factual queries: does this document directly state the answer? If yes, score 7-9. Do NOT require step-by-step instructions.
4. For Type A: does it provide a complete actionable solution?

**Calibration guard**:
- If the query asks "what are the features/highlights of X" and the document IS the feature overview of X → score 8-9, NOT 5
- If the query asks "can X do Y" and the document directly answers that question → score 8-9, NOT 3

## CURRENT TASK
Query: {user_query}{question_analysis_section}

Document:
{doc_content}

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 2 — Simple Query (factual & informational only, no troubleshooting)
 */
export const RERANKER_SIMPLE_PROMPT = `# Simple Query Document Relevance Evaluator
Mission: Score documents for short, direct queries — factual lookups, informational overviews, or brief how-to/error-code requests.

## EVALUATION CONTEXT

**Query**: {user_query}{question_analysis_section}

→ Step 1: Identify the query type (A, B, or C) from the query and analysis above.
→ Step 2: Apply the corresponding scoring criteria below.

### Document to Evaluate
**Document Content**:
{doc_content}

## QUERY TYPE AWARENESS

**Type A — Simple How-to / Error-code**
- Signals: "how to", "steps to", "configure", "set up", or bare error codes / status codes (e.g., "0x80070005", "error 403", "code -1")
- What scores high: document provides clear steps, configuration procedure, or a direct resolution to the error
- ⚠️ Concise step-by-step guides score 9-10; do NOT require lengthy background explanations

**Type B — Informational / Overview**
- Signals: "what is", "how does X work", "features of", "highlights of", "overview", "explain"
- What scores high: comprehensive, accurate information covering the topic
- ⚠️ For broad queries ("features/highlights of X"), a product overview IS the perfect answer — score 8-9

**Type C — Factual / Lookup**
- Signals: "is it true that...", "can X do...", "does X support...", "list of X", "what is the value"
- What scores high: document directly states the fact or contains the exact list
- ⚠️ Concise factual answers score 9-10; do NOT penalize for brevity

## SCORING FRAMEWORK (0-10 Integer Scale)

Score 9-10 (PERFECT): Directly and completely answers the query; no additional sources needed
Score 7-8 (HIGHLY RELEVANT): Covers the core topic well, minor gaps
Score 5-6 (MODERATELY RELEVANT): Related topic but incomplete coverage
Score 3-4 (TANGENTIAL): Related technology but different topic
Score 1-2 (MINIMAL): Mentions the topic in passing
Score 0 (IRRELEVANT): Different domain entirely

## CRITICAL RULES
✓ Integer scores ONLY (0-10)
✗ Do NOT require step-by-step instructions for factual queries
✗ Do NOT penalize short documents if they directly answer the question
✗ Do NOT score low just because a document is an overview (for overview queries, this IS high value)
✗ Do NOT require lengthy explanation for a short how-to/error-code query — direct steps or direct fix = 9-10

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 2 — Comparative Analysis (entity A vs entity B)
 */
export const RERANKER_COMPARISON_PROMPT = `# Comparative Analysis Document Relevance Evaluator
Mission: Score documents for queries comparing two subjects/products/technologies.

## EVALUATION CONTEXT

**Query**: {user_query}{question_analysis_section}

→ Step 1: From the query and analysis above, identify Entity A and Entity B.
→ Step 2: Check whether this document covers A, B, or both.
→ Step 3: Apply the scoring framework below.

### Document to Evaluate
**Document Content**:
{doc_content}

## SCORING FRAMEWORK (0-10 Integer Scale)

Score 9-10: Both A and B covered with direct comparison/contrast content (differences, trade-offs, feature matrix)
Score 8:    Both A and B present, no explicit comparison (reader can infer differences)
Score 6-7:  Only ONE of A or B, comprehensively covered (still valuable — forms one side of comparison)
Score 4-5:  Only one entity, partially covered
Score 2-3:  Mentions one entity in passing; little useful content
Score 0-1:  Neither A nor B; irrelevant

## CRITICAL RULES
✓ Integer scores ONLY (0-10)
✗ Do NOT score 0-3 for a document that comprehensively covers ONE entity — score 6-7 instead
Note: "Both present" (score 8) beats "one entity comprehensive" (score 6-7). A document covering only ONE entity scores at most 7, never 8+.

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 2 — Troubleshooting (actionable solutions, error resolution)
 */
export const RERANKER_TROUBLESHOOTING_PROMPT = `# Troubleshooting Document Relevance Evaluator
Mission: Score documents for error resolution and step-by-step fix queries.

## EVALUATION CONTEXT

**Query**: {user_query}{question_analysis_section}

→ Step 1: From the query and analysis, extract the specific error code, symptom, or product module.
→ Step 2: Check if this document addresses that specific issue.
→ Step 3: Apply the scoring framework.

### Document to Evaluate
**Document Content**:
{doc_content}

## SCORING FRAMEWORK (0-10 Integer Scale)

Score 9-10: Exact problem match + complete actionable solution steps (commands, config, procedure)
Score 7-8:  Problem match + partial solution or solid diagnostic steps
Score 5-6:  Related module/product, useful diagnostic info but no direct fix
Score 3-4:  Related technology area, minimal direct relevance to the specific error
Score 1-2:  Different problem domain; mentions the product in passing
Score 0:    Completely different technology; irrelevant

## CRITICAL RULES
✓ Integer scores ONLY (0-10)
Note: A document with diagnostic steps (even without final solution) scores 5-6, NOT 2-3.
✗ Do NOT require a complete solution to score 7+; solid diagnosis + partial fix = 7-8
✗ Do NOT penalize a document for covering a related but distinct error if it provides useful diagnostic context

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 2 — Deep Research (multi-dimensional, sub-dimension coverage)
 */
export const RERANKER_DEEP_RESEARCH_PROMPT = `# Deep Research Document Relevance Evaluator
Mission: Score documents for in-depth research queries requiring multi-dimensional coverage.

## EVALUATION CONTEXT

**Query**: {user_query}{question_analysis_section}

→ Step 1: From the "Searched sub-dimensions" list (if present in analysis above), identify
          which sub-dimension(s) this document covers. If no list, infer from the topic.
→ Step 2: Evaluate depth of coverage for that sub-dimension.
→ Step 3: Apply the scoring framework.

### Document to Evaluate
**Document Content**:
{doc_content}

## SCORING FRAMEWORK (0-10 Integer Scale)

Score 8-9: Covers 1+ sub-dimensions with comprehensive, in-depth content (mechanisms, architecture, data)
Score 5-7: Covers a sub-dimension but partially or at a high level (overview without depth)
Score 3-4: Tangentially related to the topic; no clear sub-dimension match
Score 1-2: Mentions the subject area in passing; no substantive content
Score 0:   Unrelated to the topic or sub-dimensions

## CRITICAL RULES
✓ Integer scores ONLY (0-10)
Remember: Each chunk only needs to cover ONE dimension well, not all dimensions.
✗ Do NOT require a document to cover ALL sub-dimensions to score high
✗ Do NOT penalize specialization — a highly detailed document on one sub-dimension scores 8-9

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 2 — Follow-up Query (continuation of multi-turn conversation)
 */
export const RERANKER_FOLLOWUP_PROMPT = `# Follow-up Query Document Relevance Evaluator
Mission: Score documents for follow-up questions in a multi-turn conversation.

## EVALUATION CONTEXT

**Query**: {user_query}{question_analysis_section}

→ Step 1: From the analysis (if provided), identify (a) what the follow-up is specifically asking for,
          (b) what domain/topic was discussed before.
          If no analysis is available, infer the most likely topic from the follow-up query text alone.
→ Step 2: Score based on both dimensions:
          - Does this document answer the follow-up question?
          - Is it within the original conversation domain (or the most plausible domain implied)?

### Document to Evaluate
**Document Content**:
{doc_content}

## SCORING FRAMEWORK (0-10 Integer Scale)

Score 9-10: Directly answers the follow-up AND is within the original topic domain
Score 7-8:  Answers the follow-up but tangential to original domain; or within domain but indirect answer
Score 5-6:  Within original domain but doesn't directly address the follow-up question
Score 3-4:  Tangentially related to either the follow-up or original topic
Score 1-2:  Minimal relevance to either dimension
Score 0:    Unrelated to both the follow-up and the original topic

## CRITICAL RULES
✓ Integer scores ONLY (0-10)
✗ Do NOT require both dimensions to score 7+; strong answer to the follow-up alone scores 7-8
✗ Do NOT penalize documents for not knowing the conversation history
✗ When analysis context is absent: infer the most plausible topic and score accordingly;
  do NOT default to 0-3 merely because conversation history is missing — a plausibly relevant
  document scores 5-6 or higher

Output(After taking a deep breath and carefully considering, output the score directly without any additional elaboration):`;

/**
 * Stage 1 — Sub-query Focused Filter Prompt
 */
export const RERANKER_SUB_QUERY_PROMPT = `# Sub-query Relevance Filter

## Overall Context
User's original question: {user_query}{question_analysis_section}

## Current Search Goal
The agent is NOW searching for information about: {sub_query_text}

## Document to Evaluate
{doc_content}

## Your Task
Score how well this document supports answering the CURRENT SEARCH GOAL above.

Important rules:
- The "Current Search Goal" is the primary criterion. The overall question provides context only.
- A document that perfectly covers the search goal scores 8-10, even if it doesn't cover the full original question.
- A document relevant to the original question but NOT to the current search goal scores 1-4.

Scoring scale:
8-10: Directly and substantially addresses the current search goal with useful information
5-7:  Partially addresses the search goal, provides some useful evidence
2-4:  Related to the topic domain but doesn't help with the specific search goal
0-1:  Unrelated to the search goal

Output format: integer 0-10 only.
Output(After taking a deep breath and carefully considering the CURRENT SEARCH GOAL, output the score directly without any additional elaboration):`;

/**
 * Stage 2 prompts dispatch dict
 * "" (empty playbook) falls back to RERANKER_GENERAL_PROMPT
 */
export const RERANKER_PROMPTS: Record<string, string> = {
  simple_query: RERANKER_SIMPLE_PROMPT,
  comparative_analysis: RERANKER_COMPARISON_PROMPT,
  troubleshooting: RERANKER_TROUBLESHOOTING_PROMPT,
  deep_research: RERANKER_DEEP_RESEARCH_PROMPT,
  followup_query: RERANKER_FOLLOWUP_PROMPT
};

/**
 * Get Stage 2 prompt by playbook name (with fallback)
 */
export function getRerankPrompt(playbook: string): string {
  return RERANKER_PROMPTS[playbook] || RERANKER_GENERAL_PROMPT;
}
