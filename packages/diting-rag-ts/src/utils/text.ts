// src/utils/text.ts
// Text processing utilities - aligned with Python diting_rag.agent.utils

/**
 * Strip <think>...</think> blocks from LLM output (e.g., Qwen3 thinking mode).
 *
 * Returns the content after the last </think> tag, or the original content
 * if no think blocks are found.
 */
export function stripThinkBlocks(content: string): string {
  // Fast path: no think tags (support both English <think> and Unicode variants)
  if (!content.includes('<think')) {
    return content;
  }

  // Remove all <think>...</think> blocks (including nested/partial)
  // Support both English <think> and Unicode variants for compatibility
  const regex = /<think[\s\S]*?<\/think>/gu;
  const stripped = content.replace(regex, '').trim();
  if (stripped) {
    return stripped;
  }

  // All content was inside <think> blocks — LLM produced no visible output
  return '';
}

/**
 * Parse search query parameter.
 *
 * Supports two formats:
 * - Plain string: "VPN config"  → ["VPN config"]
 * - JSON array:   '["Q1", "Q2"]' → ["Q1", "Q2"]
 *
 * JSON array enables concurrent multi-query search via a single tool call.
 */
export function parseSearchQueries(query: string): string[] {
  const stripped = query.trim();
  if (stripped.startsWith('[')) {
    try {
      const parsed = JSON.parse(stripped);
      if (Array.isArray(parsed)) {
        return parsed.map((q) => String(q).trim()).filter((q) => q);
      }
    } catch {
      // Fall through to single query handling
    }
  }
  // Fallback: single query
  return stripped ? [stripped] : [];
}

/**
 * Tokenize query into lowercase token set for similarity comparison.
 *
 * Uses jieba for Chinese text (no space boundaries) so that reordered queries
 * like "什么是HCI？" and "HCI是什么？" are detected as near-duplicates.
 * Falls back to whitespace split for pure-ASCII queries.
 */
function queryWords(q: string): Set<string> {
  // Check if query contains CJK characters
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(q)) {
    // Use simple Chinese tokenization (character-based for now)
    // In production, could integrate jieba
    const tokens: string[] = [];
    let currentWord = '';
    for (const char of q) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
        if (currentWord) {
          tokens.push(currentWord.toLowerCase());
          currentWord = '';
        }
        tokens.push(char.toLowerCase());
      } else if (/\s/.test(char)) {
        if (currentWord) {
          tokens.push(currentWord.toLowerCase());
          currentWord = '';
        }
      } else {
        currentWord += char;
      }
    }
    if (currentWord) {
      tokens.push(currentWord.toLowerCase());
    }
    return new Set(tokens.filter((t) => t));
  }
  return new Set(
    q
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w)
  );
}

/**
 * Check if new_q is too similar to any existing query (Jaccard similarity).
 *
 * Returns the similar existing query if found, null otherwise.
 */
export function isSimilarQuery(
  newQ: string,
  existingQueries: string[],
  threshold: number = 0.7
): string | null {
  const newWords = queryWords(newQ);
  if (newWords.size === 0) {
    return null;
  }

  for (const eq of existingQueries) {
    const eqWords = queryWords(eq);
    if (eqWords.size === 0) {
      continue;
    }
    const intersection = new Set([...newWords].filter((x) => eqWords.has(x)));
    const union = new Set([...newWords, ...eqWords]);
    if (intersection.size / union.size >= threshold) {
      return eq;
    }
  }
  return null;
}

/**
 * Format chunks into references string for display.
 *
 * Output format:
 *   source1: [chunk_id1](CITE) [chunk_id2](CITE)
 *   source2: [chunk_id3](CITE)
 */
export function formatReferences(
  chunks: Array<{
    id?: string;
    source_name?: string;
    sourceName?: string;
    dataset_id?: string;
    datasetId?: string;
  }>
): string {
  const references: Map<string, { datasetId: string; chunkIds: string[] }> = new Map();

  for (const chunk of chunks) {
    const chunkId = chunk.id || '';
    const sourceName = chunk.sourceName || chunk.source_name || '';
    const datasetId = chunk.datasetId || chunk.dataset_id || '';
    if (!sourceName) {
      continue;
    }
    if (!references.has(sourceName)) {
      references.set(sourceName, {
        datasetId,
        chunkIds: [chunkId]
      });
    } else {
      references.get(sourceName)!.chunkIds.push(chunkId);
    }
  }

  if (references.size === 0) {
    return '';
  }

  let referencesStr = '';
  for (const [sourceName, ref] of references.entries()) {
    const sourceStr = `${sourceName}: `;
    const chunkStr = ref.chunkIds.map((id) => `[${id}](CITE)`).join(' ');
    referencesStr += `\n${sourceStr}${chunkStr}`;
  }

  return referencesStr;
}

/**
 * Text ReAct instruction for tool calling format
 */
export const TEXT_REACT_INSTRUCTION = `
## Tool Calling Format

You must call tools using the following JSON format:

\`\`\`json
{"tool": "tool_name", "args": {"param_name": "param_value"}}
\`\`\`

Call only one tool at a time. Wait for the tool result before deciding next steps.
When no tool call is needed, output the final answer directly.

## Available Tools

{tool_descriptions}
`;

// ============================================================
// Dimension Synonyms（对齐 Python dimension_synonyms.yaml）
// ============================================================

/**
 * 对比分析维度同义词映射
 * 用于匹配搜索查询与比较维度
 */
export const DIMENSION_SYNONYMS: Record<string, string[]> = {
  definition: ['是什么', '定义', '定义是', '概念', 'definition', 'what is'],
  features: ['功能', '特性', '特点', '功能是', 'features', 'capabilities', 'functions'],
  architecture: ['架构', '结构', '体系结构', '架构是', 'architecture', 'structure'],
  use_cases: ['使用场景', '适用场景', '应用场景', 'use cases', 'scenarios', 'when to use'],
  pricing: ['价格', '费用', '定价', 'pricing', 'cost', 'price', '收费'],
  performance: ['性能', '性能是', 'performance', 'speed', 'throughput'],
  limitations: ['限制', '局限性', '不足', 'limitations', 'constraints', 'weakness'],
  advantages: ['优势', '优点', 'advantages', 'strengths', 'pros'],
  disadvantages: ['劣势', '缺点', 'disadvantages', 'cons'],
  deployment: ['部署', '安装', 'deployment', 'install', 'setup'],
  configuration: ['配置', 'configuration', 'settings'],
  security: ['安全', '安全性', 'security', 'secure'],
  compatibility: ['兼容性', 'compatibility', 'compatible'],
  support: ['支持', 'support', 'supported'],
  requirements: ['要求', '需求', 'requirements', 'prerequisites'],
  versions: ['版本', 'versions', 'version'],
  specifications: ['规格', '参数', 'specifications', 'specs']
};

/**
 * 获取维度的同义词列表
 * 对齐 Python _get_dimension_synonyms
 */
export function getDimensionSynonyms(dim: string): string[] {
  const dimLower = dim.toLowerCase();
  return DIMENSION_SYNONYMS[dimLower] ?? [];
}

// ============================================================
// buildProgressGuidance - 对齐 Python _build_progress_guidance
// ============================================================

/**
 * 构建渐进式 blackboard brief，用于 agent 决策
 * 对齐 Python _build_progress_guidance
 */
export function buildProgressGuidance(
  ctx: {
    analysis: string;
    playbook: string;
    compareObjects: string[];
    discoveredDimensions: string[];
    dimensionCoverage: Map<string, { searched?: boolean; saturated?: boolean }>;
    comparePhase: string;
    rewriteQueries: string[];
    searchQueries: string[];
    searchCount: number;
    allChunks: Array<{ sourceName?: string; source_name?: string }>;
    findings: string[];
    lacks: string[];
    keyChunkAnnotations: Map<string, string | null>;
  },
  config: { maxSearchCalls: number },
  toolNames: string[]
): string {
  const lines: string[] = [
    '[Blackboard Brief]',
    '',
    'IRON LAW: You MUST call a tool. NEVER output free text or a direct answer. ONLY use the following tool formats:'
  ];

  // --- 1. Goal: initial analysis ---
  if (ctx.analysis) {
    lines.push(`Goal: ${ctx.analysis}`);
  }

  // --- 对比查询：显示对象和维度覆盖进度 ---
  if (ctx.playbook === 'comparative_analysis') {
    // 显示对比对象
    if (ctx.compareObjects && ctx.compareObjects.length > 0) {
      lines.push(`Comparing: ${ctx.compareObjects.join(', ')}`);
    }

    // 显示发现的维度及覆盖状态
    if (ctx.discoveredDimensions && ctx.discoveredDimensions.length > 0) {
      lines.push('Dimension Coverage:');
      for (const dim of ctx.discoveredDimensions) {
        const coverage = ctx.dimensionCoverage.get(dim) || {};
        let mark: string;
        if (coverage.saturated) {
          mark = '✓✓'; // 已饱和
        } else if (coverage.searched) {
          mark = '✓'; // 已搜索
        } else {
          mark = '○'; // 未搜索
        }
        lines.push(`  ${mark} ${dim}`);
      }

      // 显示阶段
      const phaseName: Record<string, string> = {
        discovery: 'Discovery',
        enrichment: 'Enrichment',
        done: 'Done'
      };
      lines.push(`Phase: ${phaseName[ctx.comparePhase] || ctx.comparePhase}`);
    }
  }

  // --- 2. Plan: rewrite-produced sub-queries / dimensions ---
  if (ctx.rewriteQueries && ctx.rewriteQueries.length > 0) {
    const searchedSet = new Set(ctx.searchQueries);
    const planItems: string[] = [];
    for (const q of ctx.rewriteQueries) {
      if (typeof q !== 'string') continue;
      const mark = searchedSet.has(q) ? '✓' : '○';
      planItems.push(`  ${mark} ${q}`);
    }
    lines.push('Plan (✓ searched, ○ pending):');
    lines.push(...planItems);
  }

  // --- 3. Executed: search history + source coverage ---
  lines.push(
    `Searches: ${ctx.searchCount}/${config.maxSearchCalls}, chunks: ${ctx.allChunks.length}`
  );

  if (ctx.searchQueries && ctx.searchQueries.length > 0) {
    // Only show queries not already listed in Plan
    const extra = ctx.searchQueries.filter((q) => !ctx.rewriteQueries?.includes(q));
    if (extra.length > 0) {
      lines.push(`Ad-hoc queries: ${extra.map((q) => `"${q}"`).join(', ')}`);
    }
  }

  if (ctx.allChunks && ctx.allChunks.length > 0) {
    const sources: Record<string, number> = {};
    for (const c of ctx.allChunks) {
      const name = c.sourceName || c.source_name || 'unknown';
      sources[name] = (sources[name] || 0) + 1;
    }
    const sourceList = Object.entries(sources)
      .map(([name, cnt]) => `${name}(${cnt})`)
      .join(', ');
    lines.push(`Sources: ${sourceList}`);
  }

  // --- 3b. Findings / Lacks (progressive information collection) ---
  if (ctx.findings && ctx.findings.length > 0) {
    lines.push('Findings:');
    for (const f of ctx.findings) {
      lines.push(`  • ${f}`);
    }
  }
  if (ctx.lacks && ctx.lacks.length > 0) {
    lines.push('Lacks:');
    for (const la of ctx.lacks) {
      lines.push(`  • ${la}`);
    }
  } else if (ctx.findings && ctx.findings.length > 0) {
    lines.push('No remaining gaps.');
  }
  if (ctx.keyChunkAnnotations && ctx.keyChunkAnnotations.size > 0) {
    let whole = 0;
    let partial = 0;
    for (const v of ctx.keyChunkAnnotations.values()) {
      if (v === null) whole++;
      else partial++;
    }
    lines.push(
      `Key chunks annotated: ${ctx.keyChunkAnnotations.size} (${whole} whole, ${partial} partial)`
    );
  }

  // --- 4. Gap check: ask agent to reason about coverage ---
  lines.push('');
  if (ctx.playbook === 'comparative_analysis' && ctx.discoveredDimensions?.length > 0) {
    // 对比查询的特殊提示
    const unsatisfiedDims = ctx.discoveredDimensions.filter(
      (d) => !ctx.dimensionCoverage.get(d)?.searched
    );
    if (unsatisfiedDims.length > 0) {
      lines.push(
        `Gap: ${unsatisfiedDims.length} dimension(s) not yet searched: ${unsatisfiedDims.join(', ')}`
      );
    } else {
      lines.push('All dimensions searched. If low info gain on recent searches → call @summary.');
    }
  } else {
    lines.push(
      'Compare the Goal/Plan above against collected chunks. Identify which aspects are well-covered and which have gaps.'
    );
  }
  lines.push('- All aspects covered → you MUST call @summary.');
  lines.push('- Gaps remain → you MUST choose the best next action:');

  // --- 5. Next actions: adapt to registered tools ---
  const toolHints: Record<string, string> = {
    search: 'search with different keywords or relaxed conditions',
    query_rewrite: 'rewrite or decompose the query from a new angle, then search the variants'
  };
  for (const name of toolNames) {
    if (name === 'answer') continue;
    const hint = toolHints[name] || `use @${name}`;
    lines.push(`  • @${name} — ${hint}`);
  }

  lines.push('');
  lines.push('REMINDER: Output ONLY a tool call. NEVER output free text.');

  return lines.join('\n');
}
