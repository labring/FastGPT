// src/utils/lang_directive.ts
// LanguageTracker + buildLanguageConfig
// 职责：初始化语言默认值 + 运行时 per-search 语言反馈 + 异常检测

import type { ChunkItem } from '../types/chunk';
import { detectLang } from './lang';
import ISO6391 from 'iso-639-1-dir';
import type { Logger } from '../ports/logger';

// 使用 iso-639-1-dir 提供 ISO 639-1 → 母语名映射，覆盖 184 种语言
function langName(code: string): string {
  const name = ISO6391.getName(code);
  if (!name) return code;
  const native = ISO6391.getNativeName(code);
  if (native && native !== name) return `${name} (${native})`;
  return name;
}

// ============================================================
// 类型
// ============================================================

export interface LanguageTrackerConfig {
  defaultLang: string;
  userLang: string;
  confidence: 'authoritative' | 'tentative' | 'fallback';
}

export interface LangGuidanceResult {
  /** 语言纠正消息。null = 无异常或已去重 */
  guidance: string | null;
  /** 是否应压制早停信号（⚡STOP/⚠️RELEVANCE WARNING） */
  suppressEarlyStop: boolean;
  /** 是否应注入 language-guidance 消息 */
  shouldPush: boolean;
}

interface LanguageRecord {
  query: string;
  queryLang: string;
  resultStats: Record<string, number>;
}

/** 权威默认阈值：主导语言占比超过此值 → L1 */
const AUTHORITATIVE_THRESHOLD = 0.7;
/** 非默认语言最小占比，低于此值不纳入多语言候选 */
const MIN_LANG_RATIO = 0.1;

// ============================================================
// buildLanguageConfig（纯函数，route_playbook 调用）
// ============================================================

/**
 * 从 DB 采样结果构建语言配置和 system prompt directive。
 * 不依赖 LanguageTracker 实例，可在 route_playbook 节点（无 ctx）中调用。
 */
export function buildLanguageConfig(
  stats: Record<string, number> | null | undefined,
  userLang: string
): {
  directive: string;
  trackerConfig: LanguageTrackerConfig;
} {
  if (!stats) {
    return {
      directive: `No KB language data available. Start with user language ${langName(userLang)}. Adapt from search results.\nFinal answer MUST be in: ${langName(userLang)}`,
      trackerConfig: { defaultLang: userLang, userLang, confidence: 'fallback' }
    };
  }

  const entries = Object.entries(stats).filter(([, c]) => c > 0);
  if (entries.length === 0) {
    return {
      directive: `No KB language data available. Start with user language ${langName(userLang)}. Adapt from search results.\nFinal answer MUST be in: ${langName(userLang)}`,
      trackerConfig: { defaultLang: userLang, userLang, confidence: 'fallback' }
    };
  }

  const total = entries.reduce((s, [, c]) => s + c, 0);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const [dominantLang, dominantCount] = sorted[0];
  const dominantRatio = dominantCount / total;

  if (dominantRatio > AUTHORITATIVE_THRESHOLD) {
    // L1: 权威默认
    const pct = (dominantRatio * 100).toFixed(0);
    const breakdown = sorted.map(([l, c]) => `${((c / total) * 100).toFixed(0)}% ${l}`).join(', ');
    const userHint =
      dominantLang !== userLang
        ? `User asked in ${langName(userLang)}. If ${langName(dominantLang)} queries return weak results, try ${langName(userLang)} queries.`
        : '';
    return {
      directive:
        `DEFAULT SEARCH LANGUAGE: ${langName(dominantLang)} (KB is ${pct}% ${dominantLang}: ${breakdown})\n` +
        `${userHint}Final answer MUST be in: ${langName(userLang)}`.trim(),
      trackerConfig: { defaultLang: dominantLang, userLang, confidence: 'authoritative' }
    };
  }

  // L2: 分布均匀
  const breakdown = sorted.map(([l, c]) => `${((c / total) * 100).toFixed(0)}% ${l}`).join(', ');
  const userHint =
    dominantLang !== userLang
      ? `User asked in ${langName(userLang)}. If ${langName(dominantLang)} queries return weak results, try ${langName(userLang)} queries.\n`
      : '';
  return {
    directive:
      `DEFAULT SEARCH LANGUAGE: ${langName(dominantLang)} (KB: ${breakdown})\n` +
      `${userHint}Monitor results — if a topic returns mostly non-${langName(dominantLang)} chunks, adapt.\n` +
      `Final answer MUST be in: ${langName(userLang)}`,
    trackerConfig: { defaultLang: dominantLang, userLang, confidence: 'tentative' }
  };
}

/**
 * 返回 L2/L3 下应作为多语言探测目标的语言列表。
 * L1 authoritative → 空（不需要多语言探测）
 */
export function getTargetLanguages(
  config: LanguageTrackerConfig,
  stats?: Record<string, number> | null
): string[] {
  if (config.confidence === 'authoritative') return [];
  if (!stats) return [];
  const total = Object.values(stats).reduce((s, c) => s + c, 0);
  if (total === 0) return [];
  return Object.entries(stats)
    .filter(([l, c]) => l !== config.defaultLang && c / total >= MIN_LANG_RATIO)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2) // 最多 2 个额外目标语言
    .map(([l]) => l);
}

// ============================================================
// LanguageTracker（session 级追踪器）
// ============================================================

export class LanguageTracker {
  readonly defaultLang: string;
  readonly userLang: string;
  readonly confidence: 'authoritative' | 'tentative' | 'fallback';
  private records: LanguageRecord[] = [];
  private activeAnomaly: string | null = null;
  private logger?: Logger;

  constructor(config: LanguageTrackerConfig, logger?: Logger) {
    this.defaultLang = config.defaultLang;
    this.userLang = config.userLang;
    this.confidence = config.confidence;
    this.logger = logger;
  }

  /** 从 trackerConfig 创建实例（sync_blackboard 调用） */
  static fromConfig(config: LanguageTrackerConfig, logger?: Logger): LanguageTracker {
    return new LanguageTracker(config, logger);
  }

  /**
   * 记录一次搜索的语言反馈。
   * 调用时机：@search 返回 chunks 后、sub_query filter 前。
   * 使用 chunk 相关分数加权，避免噪声 dataset 的低分 chunk 干扰语言分布。
   */
  recordSearch(query: string, chunks: ChunkItem[]): void {
    const queryLang = detectLang(query);
    const resultStats: Record<string, number> = {};
    for (const c of chunks) {
      const lang = c.detectedLanguage || 'unknown';
      // 加权计数：高分 chunk 主导语言分布，噪声 dataset 的低分 chunk 权重低
      const weight = Math.max(c.rerankScore ?? c.score ?? 0, 0);
      resultStats[lang] = (resultStats[lang] || 0) + weight;
    }
    this.records.push({ query, queryLang, resultStats });
  }

  /**
   * 检测语言异常，生成条件性 guidance。
   *
   * 调用时机：sub_query filter 后（用 filter 后的 chunks 判断相关性）。
   */
  buildGuidance(filteredChunks: ChunkItem[]): LangGuidanceResult {
    if (this.records.length === 0) {
      return { guidance: null, suppressEarlyStop: false, shouldPush: false };
    }

    const last = this.records[this.records.length - 1];
    const resultDominant = this.getDominantLang(last.resultStats);

    // 计算相关性分数（跨语言检测和用户语言断连检测共用）
    const bestLLM = Math.max(
      ...filteredChunks
        .map((c) => c.llm_sub_query_score)
        .filter((s): s is number => s !== undefined),
      -Infinity
    );
    const bestBGE = Math.max(...filteredChunks.map((c) => c.rerankScore ?? c.score ?? 0), 0);

    const LLM_RELEVANT = 5;
    const BGE_RELEVANT = 0.3;

    const isRelevant =
      (bestLLM !== -Infinity && bestLLM >= LLM_RELEVANT) || bestBGE >= BGE_RELEVANT;

    // DEBUG
    const debugInfo = `queryLang=${last.queryLang} resultDominant=${resultDominant} defaultLang=${this.defaultLang} userLang=${this.userLang} bestLLM=${bestLLM} bestBGE=${bestBGE.toFixed(3)} isRel=${isRelevant} records=${this.records.length}`;
    return this._buildGuidanceInner(last, resultDominant, isRelevant, debugInfo);
  }

  private _buildGuidanceInner(
    last: LanguageRecord,
    resultDominant: string | null,
    isRelevant: boolean,
    debugInfo: string
  ): LangGuidanceResult {
    const log = (branch: string, result: LangGuidanceResult) => {
      this.logger?.debug(
        `[LanguageTracker] ${debugInfo} branch=${branch} → guidance=${result.guidance ? 'yes' : 'null'} suppress=${result.suppressEarlyStop} shouldPush=${result.shouldPush}`
      );
    };

    // 正常：搜索语言与返回主导语言一致；无法判断（语言未知）
    if (
      !resultDominant ||
      resultDominant === 'unknown' ||
      resultDominant === last.queryLang ||
      resultDominant === this.defaultLang
    ) {
      // 用户语言断连检测：搜索和结果都不是用户语言，且相关性弱
      if (
        resultDominant !== this.userLang &&
        last.queryLang !== this.userLang &&
        resultDominant !== 'unknown' &&
        !isRelevant
      ) {
        const userLangKey = `user-lang:${last.queryLang}`;
        if (this.activeAnomaly === userLangKey) {
          const result: LangGuidanceResult = {
            guidance: null,
            suppressEarlyStop: false,
            shouldPush: false
          };
          log('user-lang-dup', result);
          return result;
        }
        this.activeAnomaly = userLangKey;
        const result: LangGuidanceResult = {
          guidance:
            `⚠ LANGUAGE: Searches in ${langName(resultDominant!)} returned weak results. User asked in ${langName(this.userLang)}.\n` +
            `NEXT STEP: You MUST call @query_rewrite with strategy "translate_to ${this.userLang}" to search effectively.`,
          suppressEarlyStop: false,
          shouldPush: true
        };
        log('user-lang-disconnect', result);
        return result;
      }
      const result: LangGuidanceResult = {
        guidance: null,
        suppressEarlyStop: false,
        shouldPush: false
      };
      log('normal', result);
      return result;
    }

    // 语言不匹配 — 检查是否是跨语言 embedding 生效
    if (isRelevant) {
      const result: LangGuidanceResult = {
        guidance: null,
        suppressEarlyStop: false,
        shouldPush: false
      };
      log('cross-lingual-relevant', result);
      return result;
    }

    // 异常：语言不匹配且相关性低
    const anomalyKey = `${last.queryLang}→${resultDominant}`;
    if (this.activeAnomaly === anomalyKey) {
      const result: LangGuidanceResult = {
        guidance: null,
        suppressEarlyStop: true,
        shouldPush: false
      };
      log('anomaly-dup', result);
      return result;
    }

    this.activeAnomaly = anomalyKey;
    const result: LangGuidanceResult = {
      guidance:
        `⚠ LANGUAGE MISMATCH: Searched in ${langName(last.queryLang)} but results are mostly ${langName(resultDominant!)}.\n` +
        `NEXT STEP: You MUST call @query_rewrite to reformulate all queries in ${resultDominant}. Do NOT search again without rewording first.`,
      suppressEarlyStop: true,
      shouldPush: true
    };
    log('anomaly', result);
    return result;
  }

  clearAnomaly(): void {
    this.activeAnomaly = null;
  }

  getLastRecord(): LanguageRecord | undefined {
    return this.records[this.records.length - 1];
  }

  private getDominantLang(stats: Record<string, number>): string | null {
    const entries = Object.entries(stats).filter(([, c]) => c > 0);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }
}
