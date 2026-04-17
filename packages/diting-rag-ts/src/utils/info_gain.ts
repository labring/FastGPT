// src/utils/info_gain.ts
// Information Gain Calculator - 基于 Jaccard 相似度的信息增益计算
// 注：原版 Python 是独立工具类（非 Skill），有状态（history + fingerprint）

import type { ChunkItem } from '../types/chunk';
import { INFO_GAIN_THRESHOLD } from './constants';

/**
 * 信息增益计算结果
 */
export interface InfoGainResult {
  gain: number;
  label: 'low' | 'medium' | 'high';
  overlapCount: number;
  newChunks: ChunkItem[];
}

/**
 * Information Gain Calculator
 * 有状态类，维护历史 fingerprint，用于渐进式信息收集
 * 被 ChunkSelector 调用，用于过滤低信息增益的 chunks
 */
export class InformationGainCalculator {
  private history: ChunkItem[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 10) {
    this.maxHistory = maxHistory;
  }

  /**
   * 添加已选中的 chunk 到历史
   */
  addSelected(chunk: ChunkItem): void {
    const fingerprint = this.extractFingerprint(chunk.content);
    this.history.push({
      ...chunk,
      fingerprint
    } as ChunkItem);

    // 保持历史大小
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * 计算单个 chunk 的信息增益
   */
  computeInfoGain(chunk: ChunkItem): number {
    if (this.history.length === 0) {
      return 1.0; // 首次检索，信息增益最大
    }

    const fingerprint = this.extractFingerprint(chunk.content);

    // 计算与所有历史 fingerprint 的 Jaccard 相似度
    let maxJaccard = 0;
    for (const histChunk of this.history) {
      const histFingerprint = (histChunk as unknown as { fingerprint: Set<string> }).fingerprint;
      if (!histFingerprint) continue;
      const jaccard = this.calcJaccard(fingerprint, histFingerprint);
      maxJaccard = Math.max(maxJaccard, jaccard);
    }

    // 信息增益 = 1 - max(Jaccard)
    return 1 - maxJaccard;
  }

  /**
   * 提取文本 fingerprint（词集合）
   */
  private extractFingerprint(content: string): Set<string> {
    const words = new Set<string>();

    // 英文词（按词边界）
    const englishWords = content.toLowerCase().match(/\b[a-zA-Z]{2,}\b/g) || [];
    englishWords.forEach((w) => words.add(w));

    // 中文词（连续中文字符）
    const chineseWords = content.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    chineseWords.forEach((w) => words.add(w));

    return words;
  }

  /**
   * 计算 Jaccard 相似度
   */
  private calcJaccard(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 0;

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 重置历史
   */
  reset(): void {
    this.history = [];
  }

  /**
   * 获取历史大小
   */
  historySize(): number {
    return this.history.length;
  }
}

/**
 * 静态函数：计算信息增益（无状态版本，用于简单场景）
 */
export function calculateInfoGain(
  newChunks: ChunkItem[],
  existingChunks: ChunkItem[],
  _threshold: number = INFO_GAIN_THRESHOLD.LOW
): InfoGainResult {
  const existingSet = new Set(existingChunks.map((c) => c.id));
  const newSet = new Set(newChunks.map((c) => c.id));

  // 计算交集
  const overlap = [...newSet].filter((id) => existingSet.has(id));
  const overlapCount = overlap.length;

  // 计算 Jaccard 相似度
  const union = new Set([...existingSet, ...newSet]);
  const jaccard = union.size > 0 ? overlapCount / union.size : 0;

  // 信息增益 = 1 - 相似度
  const gain = 1 - jaccard;

  // 新增的 chunks
  const newOnly = newChunks.filter((c) => !existingSet.has(c.id));

  // 分类
  let label: 'low' | 'medium' | 'high';
  if (gain < INFO_GAIN_THRESHOLD.LOW) {
    label = 'low';
  } else if (gain < INFO_GAIN_THRESHOLD.MEDIUM) {
    label = 'medium';
  } else {
    label = 'high';
  }

  return { gain, label, overlapCount, newChunks: newOnly };
}
